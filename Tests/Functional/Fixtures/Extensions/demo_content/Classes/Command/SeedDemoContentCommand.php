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
 * elements, one translation, SEO flags) that every built-in typo3_pagetree_facets
 * tab has something real to filter, instead of the single bare "Home" page
 * the base TYPO3 install produces. Dev-only, run via
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
    private const array PAGE_TITLES = [
        'About us', 'Products', 'Archive', 'Legal', 'Coming Soon',
        'Partner Website', 'Old Homepage', 'Assets', 'Contact',
    ];

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
            $this->localizePage((int) $uids['NEW_about'], $output);
        }

        $this->backdateActivityTestData($uids);

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
        ];
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
