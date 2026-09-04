<?php

declare(strict_types=1);

/*
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeFacetsDemoContent\Command;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Core\Bootstrap;
use TYPO3\CMS\Core\Database\{Connection, ConnectionPool};
use TYPO3\CMS\Core\DataHandling\DataHandler;
use TYPO3\CMS\Core\Utility\GeneralUtility;

use function count;

/**
 * SeedDemoContentCommand.
 *
 * Seeds a page tree with enough variety (page states, doktypes, content
 * elements, one translation, SEO flags, several editors) that every built-in
 * typo3_pagetree_facets tab has something real to filter, instead of the single
 * bare "Home" page the base TYPO3 install produces. Dev-only, run via
 * `ddev 14 typo3 pagetree-facets:seed-demo-content`.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsCommand(
    name: 'pagetree-facets:seed-demo-content',
    description: 'Seeds a richer page tree for local typo3_pagetree_facets testing.',
)]
final class SeedDemoContentCommand extends Command
{
    /** Titles created by this command - used to make re-running it idempotent. */
    private const PAGE_TITLES = [
        'About us', 'Products', 'Archive', 'Legal', 'Coming Soon',
        'Partner Website', 'Old Homepage', 'Assets', 'Contact',
        'Team', 'Jobs',
    ];

    /**
     * backend_layout RECORDS, so the Backend layout tab has record-based
     * layouts ("10", "11" style values) to offer. Each carries its own grid:
     * the filter tab never reads the config, but a record whose grid
     * contradicts its title is worse than useless everywhere else in the
     * backend.
     *
     * @var array<string, array{description: string, config: string}>
     */
    private const LAYOUT_RECORDS = [
        'Demo: One column' => [
            'description' => 'Single content column.',
            'config' => 'backend_layout {
    colCount = 1
    rowCount = 1
    rows {
        1 {
            columns {
                1 {
                    name = Main
                    colPos = 0
                }
            }
        }
    }
}',
        ],
        'Demo: Two columns' => [
            'description' => 'Main column plus sidebar.',
            'config' => 'backend_layout {
    colCount = 2
    rowCount = 1
    rows {
        1 {
            columns {
                1 {
                    name = Main
                    colPos = 0
                }
                2 {
                    name = Sidebar
                    colPos = 1
                }
            }
        }
    }
}',
        ],
    ];

    /**
     * The other half of what that tab surfaces: layouts defined in page
     * TSconfig, which end up as "pagets__<key>" values. Written to the root
     * page's TSconfig field between markers so a re-run replaces exactly this
     * block and leaves anything else in that field alone.
     */
    private const TSCONFIG_MARKER_START = '# --- pagetree-facets demo layouts (start) ---';
    private const TSCONFIG_MARKER_END = '# --- pagetree-facets demo layouts (end) ---';

    /**
     * Editors the Activity tab's "Edited by"/"Created by" pickers can be tried
     * against - with only the install's single admin there is nobody to pick.
     * Kept as admins on purpose: this is a local demo instance, and a full
     * group/permission setup would be a different exercise than the one these
     * accounts exist for. Never deleted on a re-run (see ensureEditors) - the
     * history they are attributed in points at their uids.
     */
    private const EDITORS = [
        'anna.editor' => 'Anna Schmidt',
        'ben.author' => 'Ben Weber',
        'clara.reviewer' => 'Clara Fischer',
    ];

    /** The password the ddev addon gives its admin - dev-only, same as that one. */
    private const EDITOR_PASSWORD = 'Password1!';

    public function __construct(
        private readonly ConnectionPool $connectionPool,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        Bootstrap::initializeBackendAuthentication();
        /** @var BackendUserAuthentication $backendUser */
        $backendUser = $GLOBALS['BE_USER'];
        $backendUser->user['admin'] = 1;
        $backendUser->workspace = 0;

        $rootPageId = 1; // "Home", created by the base `typo3 setup --create-site` step

        $this->deletePreviousRun($rootPageId, $output);

        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start($this->buildDataMap($rootPageId), []);
        $dataHandler->process_datamap();
        if ([] !== $dataHandler->errorLog) {
            $output->writeln('<error>'.implode("\n", $dataHandler->errorLog).'</error>');

            return Command::FAILURE;
        }

        $uids = $dataHandler->substNEWwithIDs;

        if (isset($uids['NEW_about'])) {
            $this->localizePage($uids['NEW_about'], $output);
        }

        $this->backdateActivityTestData($uids);
        $this->assignBackendLayouts($uids, $output);
        $this->seedPageTsConfigLayouts($rootPageId, $output);
        $this->attributePagesToEditors($backendUser, $rootPageId, $uids, $output);

        $output->writeln('<info>Demo content seeded ('.count($uids).' records created).</info>');

        return Command::SUCCESS;
    }

    /**
     * Deletes pages from a previous run of this command (matched by title
     * directly under $rootPageId) via the normal DataHandler delete cmd - not
     * a raw SQL wipe - so it stays a soft delete with reference-index/cache
     * handling intact. Makes the command safe to re-run after code changes
     * instead of accumulating duplicates on every invocation.
     */
    private function deletePreviousRun(int $rootPageId, OutputInterface $output): void
    {
        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('pages');
        $queryBuilder->getRestrictions()->removeAll();
        $uids = $queryBuilder
            ->select('uid')
            ->from('pages')
            ->where(
                $queryBuilder->expr()->eq('pid', $queryBuilder->createNamedParameter($rootPageId, Connection::PARAM_INT)),
                $queryBuilder->expr()->eq('sys_language_uid', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                $queryBuilder->expr()->in('title', $queryBuilder->createNamedParameter(self::PAGE_TITLES, Connection::PARAM_STR_ARRAY)),
            )
            ->executeQuery()
            ->fetchFirstColumn();
        if ([] === $uids) {
            return;
        }
        $cmd = ['pages' => []];
        foreach ($uids as $uid) {
            $cmd['pages'][(int) $uid] = ['delete' => 1];
        }
        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start([], $cmd);
        $dataHandler->process_cmdmap();
        // The layout records need no cleanup of their own: they live on the
        // "Assets" sysfolder deleted right here, and deleteSpecificPage()
        // cascades over every TCA table on a page it removes.
        $output->writeln('<comment>Removed '.count($uids).' page(s) from a previous run.</comment>');
    }

    /**
     * @return array<string, array<string, array<string, mixed>>>
     */
    private function buildDataMap(int $rootPageId): array
    {
        return [
            'pages' => [
                'NEW_about' => [
                    'pid' => $rootPageId,
                    'title' => 'About us',
                    'doktype' => 1,
                    'hidden' => 0,
                    'abstract' => 'Learn more about our company and team.',
                    'description' => 'Company background and team overview.',
                    // Only a couple of pages get one, so a filter on "no navigation
                    // title" has something to tell apart - EXT:example_tab adds
                    // exactly that criterion as its demo option.
                    'nav_title' => 'About',
                ],
                'NEW_products' => [
                    'pid' => $rootPageId,
                    'title' => 'Products',
                    'doktype' => 1,
                    'hidden' => 0,
                    'no_index' => 1,
                    'nav_title' => 'Our products',
                ],
                'NEW_archive' => [
                    'pid' => $rootPageId,
                    'title' => 'Archive',
                    'doktype' => 1,
                    'hidden' => 1,
                ],
                'NEW_legal' => [
                    'pid' => $rootPageId,
                    'title' => 'Legal',
                    'doktype' => 1,
                    'hidden' => 0,
                    // A placeholder group id, not a real fe_groups record: the
                    // PageStateTab filter only checks that this field is
                    // non-empty, and fe_groups cannot be created via
                    // DataHandler on a regular content page or the tree root
                    // (isTableAllowedForThisPage() rejects both).
                    'fe_group' => '1',
                    'editlock' => 1,
                    'no_follow' => 1,
                ],
                'NEW_soon' => [
                    'pid' => $rootPageId,
                    'title' => 'Coming Soon',
                    'doktype' => 1,
                    'hidden' => 0,
                    'starttime' => time() + 86400 * 30,
                ],
                'NEW_external' => [
                    'pid' => $rootPageId,
                    'title' => 'Partner Website',
                    'doktype' => 3,
                    'hidden' => 0,
                    'url' => 'https://example.com',
                ],
                'NEW_shortcut' => [
                    'pid' => $rootPageId,
                    'title' => 'Old Homepage',
                    'doktype' => 4,
                    'hidden' => 0,
                    'shortcut' => $rootPageId,
                    'shortcut_mode' => 0,
                ],
                'NEW_media' => [
                    'pid' => $rootPageId,
                    'title' => 'Assets',
                    'doktype' => 254,
                    'hidden' => 0,
                ],
                'NEW_contact' => [
                    'pid' => $rootPageId,
                    'title' => 'Contact',
                    'doktype' => 1,
                    'hidden' => 0,
                ],
            ],
            'tt_content' => [
                'NEW_ce1' => ['pid' => 'NEW_about', 'colPos' => 0, 'CType' => 'header', 'header' => 'About us'],
                'NEW_ce2' => ['pid' => 'NEW_about', 'colPos' => 0, 'CType' => 'text', 'bodytext' => '<p>We build great software.</p>'],
                'NEW_ce3' => ['pid' => 'NEW_products', 'colPos' => 0, 'CType' => 'header', 'header' => 'Our products'],
                'NEW_ce4' => ['pid' => 'NEW_products', 'colPos' => 0, 'CType' => 'textmedia', 'header' => 'Flagship product', 'bodytext' => '<p>Details on our main product.</p>'],
                'NEW_ce5' => ['pid' => 'NEW_products', 'colPos' => 0, 'CType' => 'bullets', 'header' => 'Key features', 'bodytext' => "Fast\nReliable\nSecure"],
                'NEW_ce6' => ['pid' => 'NEW_contact', 'colPos' => 0, 'CType' => 'text', 'header' => 'Get in touch', 'bodytext' => '<p>Email us anytime.</p>'],
                'NEW_ce7' => ['pid' => 'NEW_legal', 'colPos' => 0, 'CType' => 'text', 'header' => 'Terms', 'bodytext' => '<p>Legal terms and conditions.</p>'],
            ],
            'sys_category' => [
                'NEW_cat1' => ['pid' => 'NEW_media', 'title' => 'Featured'],
            ],
            // Parked on the "Assets" sysfolder like the demo category. The
            // storage page does not matter for the layout pickers: with no
            // _STORAGE_PID and no pageTSconfig id set, the core's data provider
            // returns every backend_layout record regardless of where it lives.
            'backend_layout' => $this->buildLayoutRecordMap(),
        ];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function buildLayoutRecordMap(): array
    {
        $records = [];
        $index = 0;
        foreach (self::LAYOUT_RECORDS as $title => $layout) {
            $records['NEW_layout'.$index++] = [
                'pid' => 'NEW_media',
                'title' => $title,
                'description' => $layout['description'],
                'config' => $layout['config'],
            ];
        }

        return $records;
    }

    /**
     * Spreads the seeded layouts over the demo pages so "layout:" has all four
     * shapes to filter: a record layout, a page-TSconfig layout, the explicit
     * "none", and pages that simply leave the field empty - plus a spread of
     * "pagelayout:" values for the frontend layout field.
     *
     * A second DataHandler pass, not part of the main datamap: pages.backend_layout
     * is a plain select without foreign_table, so DataHandler does not resolve
     * NEW placeholders in it - the record uids have to exist first.
     *
     * @param array<string, int|string> $uids
     */
    private function assignBackendLayouts(array $uids, OutputInterface $output): void
    {
        $first = (int) ($uids['NEW_layout0'] ?? 0);
        $second = (int) ($uids['NEW_layout1'] ?? 0);
        if (0 === $first || 0 === $second) {
            $output->writeln('<comment>Skipped backend layout assignment: layout records were not created.</comment>');

            return;
        }

        // [backend_layout, layout]. The frontend layout deliberately does not
        // track the backend one - "pagelayout:" has to be visibly its own
        // criterion, not a synonym for "layout:".
        $assignments = [
            'NEW_about' => [(string) $first, '1'],
            'NEW_products' => [(string) $second, '2'],
            'NEW_contact' => [(string) $second, '0'],
            'NEW_legal' => ['pagets__demo_landing', '1'],
            // -1 is the core's "None" item: explicitly no layout, which is a
            // different answer than leaving the field empty. "Coming Soon" and
            // the rest stay empty on purpose so both cases exist in the tree.
            'NEW_archive' => ['-1', '3'],
        ];

        $dataMap = ['pages' => []];
        foreach ($assignments as $key => [$backendLayout, $frontendLayout]) {
            if (isset($uids[$key])) {
                $dataMap['pages'][(int) $uids[$key]] = [
                    'backend_layout' => $backendLayout,
                    'layout' => $frontendLayout,
                ];
            }
        }
        if ([] === $dataMap['pages']) {
            return;
        }

        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start($dataMap, []);
        $dataHandler->process_datamap();
        if ([] !== $dataHandler->errorLog) {
            $output->writeln('<error>'.implode("\n", $dataHandler->errorLog).'</error>');

            return;
        }
        $output->writeln('<comment>Assigned backend layouts to '.count($dataMap['pages']).' page(s).</comment>');
    }

    /**
     * Writes the "pagets__" half of the demo into the root page's TSconfig
     * field. Root page, not a subtree page: page TSconfig is inherited down the
     * rootline, and the filter modal collects its options from the site roots.
     *
     * Bounded by markers and rewritten in place, so re-running replaces exactly
     * this block instead of appending a copy or overwriting a field this
     * command does not own.
     */
    private function seedPageTsConfigLayouts(int $rootPageId, OutputInterface $output): void
    {
        $block = self::TSCONFIG_MARKER_START."\nmod.web_layout.BackendLayouts {\n"
            ."    demo_landing {\n"
            ."        title = Demo: Landing page\n"
            ."        config {\n"
            ."            backend_layout {\n"
            ."                colCount = 1\n"
            ."                rowCount = 1\n"
            ."                rows.1.columns.1 {\n"
            ."                    name = Landing\n"
            ."                    colPos = 0\n"
            ."                }\n"
            ."            }\n"
            ."        }\n"
            ."    }\n}\n".self::TSCONFIG_MARKER_END;

        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('pages');
        $queryBuilder->getRestrictions()->removeAll();
        $current = (string) ($queryBuilder
            ->select('TSconfig')
            ->from('pages')
            ->where($queryBuilder->expr()->eq('uid', $queryBuilder->createNamedParameter($rootPageId, Connection::PARAM_INT)))
            ->executeQuery()
            ->fetchOne() ?: '');

        $pattern = '/'.preg_quote(self::TSCONFIG_MARKER_START, '/').'.*?'.preg_quote(self::TSCONFIG_MARKER_END, '/').'/s';
        $updated = 1 === preg_match($pattern, $current)
            ? (string) preg_replace($pattern, $block, $current)
            : trim($current."\n\n".$block);

        if ($updated === $current) {
            return;
        }

        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start(['pages' => [$rootPageId => ['TSconfig' => $updated]]], []);
        $dataHandler->process_datamap();
        if ([] !== $dataHandler->errorLog) {
            $output->writeln('<error>'.implode("\n", $dataHandler->errorLog).'</error>');

            return;
        }
        $output->writeln('<comment>Added the "pagets__demo_landing" layout to the root page TSconfig.</comment>');
    }

    /**
     * Skips silently (with a message) if language 1 is not configured on the
     * site - the command still works before the demo German language exists.
     */
    private function localizePage(int $pageUid, OutputInterface $output): void
    {
        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start([], [
            'pages' => [
                $pageUid => ['localize' => 1],
            ],
        ]);
        $dataHandler->process_cmdmap();
        if ([] !== $dataHandler->errorLog) {
            $output->writeln('<comment>Skipped translating "About us": '.implode(', ', $dataHandler->errorLog).'</comment>');
        }
    }

    /**
     * Gives the Activity tab's two people pickers something to find. Both keys
     * read sys_history rather than a cruser_id column (that one is gone since
     * v12), so the attribution has to come from a real write performed as that
     * user - a hand-written history row would be a different thing wearing the
     * same shape.
     *
     * @param array<string, int|string> $uids
     */
    private function attributePagesToEditors(
        BackendUserAuthentication $backendUser,
        int $rootPageId,
        array $uids,
        OutputInterface $output,
    ): void {
        $editors = $this->ensureEditors($output);

        // One editor ends up under both pickers, one only under "Created by",
        // one only under "Edited by" - enough to tell the two keys apart.
        foreach (['anna.editor' => 'Team', 'ben.author' => 'Jobs'] as $username => $title) {
            $this->asUser($backendUser, $editors[$username], $username, function () use ($rootPageId, $title): void {
                $this->createEditorPage($rootPageId, $title);
            });
        }

        $edits = [
            'anna.editor' => 'NEW_about',
            'clara.reviewer' => 'NEW_products',
            'ben.author' => 'NEW_contact',
        ];
        foreach ($edits as $username => $key) {
            if (!isset($uids[$key])) {
                continue;
            }
            $this->asUser($backendUser, $editors[$username], $username, function () use ($uids, $key, $username): void {
                $this->touchPage((int) $uids[$key], self::EDITORS[$username]);
            });
        }

        $output->writeln('<comment>Attributed pages to '.implode(', ', array_keys($editors)).'.</comment>');
    }

    /**
     * Creates the demo editors that are not there yet, matched by username.
     * Existing ones are left alone rather than recreated: the history written
     * above points at their uids, and a fresh account would orphan it.
     *
     * @return array<string, int> username => uid
     */
    private function ensureEditors(OutputInterface $output): array
    {
        $existing = $this->findEditorUids();
        $missing = array_diff_key(self::EDITORS, $existing);
        if ([] === $missing) {
            return $existing;
        }

        $dataMap = ['be_users' => []];
        foreach ($missing as $username => $realName) {
            $dataMap['be_users']['NEW_'.str_replace('.', '_', $username)] = [
                'pid' => 0,
                'username' => $username,
                'realName' => $realName,
                // DataHandler hashes this on save, so the plaintext never lands
                // in the database.
                'password' => self::EDITOR_PASSWORD,
                'admin' => 1,
                'db_mountpoints' => '1',
            ];
        }
        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start($dataMap, []);
        $dataHandler->process_datamap();
        if ([] !== $dataHandler->errorLog) {
            $output->writeln('<error>'.implode("\n", $dataHandler->errorLog).'</error>');
        }
        $output->writeln('<comment>Created '.count($missing).' demo editor(s), password "'.self::EDITOR_PASSWORD.'".</comment>');

        return $this->findEditorUids();
    }

    /**
     * @return array<string, int> username => uid, for those that exist
     */
    private function findEditorUids(): array
    {
        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('be_users');
        $queryBuilder->getRestrictions()->removeAll();
        $rows = $queryBuilder
            ->select('uid', 'username')
            ->from('be_users')
            ->where(
                $queryBuilder->expr()->in(
                    'username',
                    $queryBuilder->createNamedParameter(array_keys(self::EDITORS), Connection::PARAM_STR_ARRAY),
                ),
            )
            ->executeQuery()
            ->fetchAllAssociative();

        $uids = [];
        foreach ($rows as $row) {
            $uids[(string) $row['username']] = (int) $row['uid'];
        }

        return $uids;
    }

    /**
     * DataHandler stamps history with whatever uid the current backend user
     * carries, so borrowing that identity for one write is what makes the
     * attribution real rather than staged.
     */
    private function asUser(BackendUserAuthentication $backendUser, int $uid, string $username, callable $work): void
    {
        $previous = [$backendUser->user['uid'] ?? 0, $backendUser->user['username'] ?? ''];
        $backendUser->user['uid'] = $uid;
        $backendUser->user['username'] = $username;
        try {
            $work();
        } finally {
            [$backendUser->user['uid'], $backendUser->user['username']] = $previous;
        }
    }

    private function createEditorPage(int $rootPageId, string $title): void
    {
        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start([
            'pages' => [
                'NEW_'.strtolower($title) => [
                    'pid' => $rootPageId,
                    'title' => $title,
                    'doktype' => 1,
                    'hidden' => 0,
                ],
            ],
        ], []);
        $dataHandler->process_datamap();
    }

    /**
     * A real edit, on a field no filter reads - the point is the history entry,
     * not the value, and touching e.g. nav_title would quietly change what the
     * other tabs have to show for themselves.
     */
    private function touchPage(int $pageUid, string $editor): void
    {
        $dataHandler = GeneralUtility::makeInstance(DataHandler::class);
        $dataHandler->start(['pages' => [$pageUid => ['subtitle' => 'Last reviewed by '.$editor]]], []);
        $dataHandler->process_datamap();
    }

    /**
     * DataHandler always stamps tstamp/crdate as "now" on create and does not
     * expose them as editable datamap fields, so a couple of records are
     * backdated directly via SQL afterwards - purely so the Activity tab's
     * "untouched for more than X" presets return something. Same accepted
     * practice as this repo's own PHPUnit fixtures (ActivityTab.csv hardcodes
     * stale/fresh timestamps directly), not a general DataHandler bypass.
     *
     * @param array<string, int|string> $uids
     */
    private function backdateActivityTestData(array $uids): void
    {
        $staleTimestamp = time() - (400 * 86400); // >1 year old
        $connection = $this->connectionPool->getConnectionForTable('pages');
        foreach (['NEW_archive', 'NEW_legal'] as $key) {
            if (!isset($uids[$key])) {
                continue;
            }
            $connection->update(
                'pages',
                ['tstamp' => $staleTimestamp, 'crdate' => $staleTimestamp],
                ['uid' => (int) $uids[$key]],
            );
        }
    }
}
