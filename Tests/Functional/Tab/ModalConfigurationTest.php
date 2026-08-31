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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Tab;

use KonradMichalik\PagetreeFacets\Tab\{ContentElementTab, DoktypeTab, LayoutTab, PageStateTab, RecordsTab, TranslationsTab};
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\Cache\CacheManager;
use TYPO3\CMS\Core\Configuration\SiteWriter;
use TYPO3\CMS\Core\Database\ConnectionPool;

use function count;
use function in_array;

/**
 * ModalConfigurationTest.
 *
 * The declarative modal schemas against real TCA and real site
 * configuration - the promise "custom doktypes/CTypes appear automatically
 * with their icons" is only testable here, not in unit tests.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class ModalConfigurationTest extends AbstractTabTestCase
{
    protected array $coreExtensionsToLoad = ['fluid_styled_content'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/DoktypeTab.csv');
        $this->importCSVDataSet(__DIR__.'/../Fixtures/LayoutRecords.csv');
    }

    #[Test]
    public function doktypeOptionsComeFromTca(): void
    {
        $configuration = $this->get(DoktypeTab::class)->getModalConfiguration($this->createContext());
        $options = array_column($configuration['fields'][0]['options'], null, 'value');

        self::assertArrayHasKey('1', $options);   // standard page
        self::assertArrayHasKey('254', $options); // sysfolder
        self::assertNotSame('', $options['254']['icon'], 'Doktype icon must be derived from TCA');
    }

    #[Test]
    public function contentElementOptionsComeFromTcaIncludingIcons(): void
    {
        $configuration = $this->get(ContentElementTab::class)->getModalConfiguration($this->createContext());
        $options = array_column($this->flattenOptions($configuration), null, 'value');

        self::assertArrayHasKey('textmedia', $options);
        self::assertNotSame('', $options['textmedia']['icon']);
        foreach (array_keys($options) as $value) {
            self::assertStringStartsNotWith('--', (string) $value, 'Divider items must be filtered out');
        }
    }

    #[Test]
    public function contentElementOptionsAreSplitIntoOneFieldPerWizardGroup(): void
    {
        $configuration = $this->get(ContentElementTab::class)->getModalConfiguration($this->createContext());

        // Raw LLL labels, like every other label in a modal configuration -
        // FacetsModalController translates them on the way out. Groups without a
        // single option are omitted, so these are a subset of the TCA itemGroups
        // in itemGroups order.
        $itemGroups = $GLOBALS['TCA']['tt_content']['columns']['CType']['config']['itemGroups'];
        $labels = array_column($configuration['fields'], 'label');

        self::assertGreaterThan(1, count($labels), 'Core plus fluid_styled_content span several wizard groups');
        self::assertContains($itemGroups['default'], $labels);
        self::assertSame(
            $labels,
            array_values(array_intersect($itemGroups, $labels)),
            'Fields must keep the TCA itemGroups order',
        );

        foreach ($configuration['fields'] as $field) {
            self::assertSame('checkbox-group', $field['type']);
            // One shared name is what keeps the groups a single criterion for
            // serialize()/hydrate() and the modal's value collection.
            self::assertSame('ce', $field['name']);
            self::assertNotSame([], $field['options'], 'An empty group must not produce a field');
        }
    }

    #[Test]
    public function contentElementOptionsAreRestrictedByCTypePermissions(): void
    {
        $editor = $this->setUpBackendUser(2);
        $editor->groupData['explicit_allowdeny'] = 'tt_content:CType:textmedia';

        $configuration = $this->get(ContentElementTab::class)->getModalConfiguration($this->createContext(null, $editor));

        self::assertSame(['textmedia'], array_column($this->flattenOptions($configuration), 'value'));
    }

    #[Test]
    public function doktypeOptionsAreRestrictedByPageTypePermissions(): void
    {
        $editor = $this->setUpBackendUser(2);
        $editor->groupData['pagetypes_select'] = '1';

        $configuration = $this->get(DoktypeTab::class)->getModalConfiguration($this->createContext(null, $editor));

        self::assertSame(['1'], array_column($configuration['fields'][0]['options'], 'value'));
    }

    #[Test]
    public function backendLayoutOptionsComeFromTheLayoutDataProvidersNotFromStaticTca(): void
    {
        // Static TCA holds only two placeholder items; everything real arrives
        // through the itemsProcFunc, which is exactly what this asserts.
        $configuration = $this->get(LayoutTab::class)->getModalConfiguration($this->createContext());
        $values = array_column($configuration['fields'][0]['options'], 'value');

        self::assertContains('10', $values, 'The backend_layout record from the fixture must be offered');
        self::assertNotContains('', $values, 'The "not set" placeholder must not become a facet');
    }

    #[Test]
    public function backendLayoutOptionsIncludeTheExplicitNoneEntry(): void
    {
        $configuration = $this->get(LayoutTab::class)->getModalConfiguration($this->createContext());

        self::assertContains('-1', array_column($configuration['fields'][0]['options'], 'value'));
    }

    #[Test]
    public function backendLayoutOptionsIncludeLayoutsFromASiteRootsOwnPageTsConfig(): void
    {
        // The reason options are collected per site root and not from page 0
        // alone: page 0 sees globally registered page TSconfig, never what is
        // typed into a root page's TSconfig field. Without the per-root pass
        // this layout is invisible in the modal while "layout:pagets__from_root"
        // still matches - the exact mismatch this asserts against.
        $this->writeSiteConfiguration('main', ['rootPageId' => 1, 'base' => '/']);
        // The config.backend_layout block is not decoration: the core's
        // provider skips any TSconfig layout without one.
        $this->setPageTsConfig(1, <<<'TSCONFIG'
            mod.web_layout.BackendLayouts.from_root {
                title = Root defined
                config.backend_layout {
                    colCount = 1
                    rowCount = 1
                    rows.1.columns.1 {
                        name = Main
                        colPos = 0
                    }
                }
            }
            TSCONFIG);

        $configuration = $this->get(LayoutTab::class)->getModalConfiguration($this->createContext());
        $options = array_column($configuration['fields'][0]['options'], null, 'value');

        self::assertArrayHasKey('pagets__from_root', $options);
        self::assertSame('Root defined', $options['pagets__from_root']['label']);
    }

    #[Test]
    public function frontendLayoutOptionsComeFromStaticTcaWithoutTheDefaultValue(): void
    {
        $configuration = $this->get(LayoutTab::class)->getModalConfiguration($this->createContext());
        $fields = array_column($configuration['fields'], null, 'name');

        self::assertArrayHasKey('pagelayout', $fields, 'The frontend layout field must be offered alongside the backend one');
        $values = array_column($fields['pagelayout']['options'], 'value');

        self::assertSame(['1', '2', '3'], $values, 'Core ships 0..3; "0" is the column default and must not become a facet');
    }

    #[Test]
    public function recordsTableOptionsRespectHideTable(): void
    {
        $configuration = $this->get(RecordsTab::class)->getModalConfiguration($this->createContext());
        $tables = array_column($this->flattenOptions($configuration), 'value');

        self::assertContains('tt_content', $tables);
        self::assertContains('pages', $tables);
        // sys_file* carry ctrl.hideTable in the core TCA - tables the backend
        // hides from record listings must not show up as a facet either.
        self::assertNotContains('sys_file_reference', $tables);
        self::assertNotContains('sys_file_metadata', $tables);
    }

    #[Test]
    public function recordsTableOptionsAreGroupedWithCoreTablesTogether(): void
    {
        $configuration = $this->get(RecordsTab::class)->getModalConfiguration($this->createContext());
        $tableFields = array_values(array_filter($configuration['fields'], static fn (array $field): bool => 'table' === $field['name']));

        $coreField = null;
        foreach ($tableFields as $field) {
            if (in_array('pages', array_column($field['options'], 'value'), true)) {
                $coreField = $field;
            }
        }

        self::assertNotNull($coreField, 'Expected one table field to contain "pages"');
        self::assertSame('LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:records.group.core', $coreField['label']);
        self::assertContains('tt_content', array_column($coreField['options'], 'value'), 'pages and tt_content must share the same core bucket');
    }

    #[Test]
    public function pageStateOptionsAreComplete(): void
    {
        $configuration = $this->get(PageStateTab::class)->getModalConfiguration($this->createContext());

        self::assertSame(
            ['empty', 'restricted', 'hidden', 'hidden-in-menu', 'timed', 'editlocked'],
            array_column($configuration['fields'][0]['options'], 'value'),
        );
    }

    #[Test]
    public function translationOptionsComeFromSiteLanguagesWithoutDefault(): void
    {
        $this->writeSiteConfiguration('main', [
            'rootPageId' => 1,
            'base' => '/',
            'languages' => [
                ['languageId' => 0, 'title' => 'English', 'locale' => 'en_US.UTF-8', 'base' => '/', 'flag' => 'us'],
                ['languageId' => 1, 'title' => 'Dansk', 'locale' => 'da_DK.UTF-8', 'base' => '/da/', 'flag' => 'dk'],
            ],
        ]);

        $configuration = $this->get(TranslationsTab::class)->getModalConfiguration($this->createContext('main'));
        $options = $configuration['fields'][0]['options'];

        self::assertCount(1, $options, 'Default language must not be offered');
        self::assertSame('1', $options[0]['value']);
        self::assertSame('Dansk', $options[0]['label']);
    }

    #[Test]
    public function translationOptionsAreLimitedToSitesInsideTheUsersWebMounts(): void
    {
        $this->importCSVDataSet(__DIR__.'/../Fixtures/TranslationsTabSecondSite.csv');
        $this->writeSiteConfiguration('main', [
            'rootPageId' => 1,
            'base' => '/',
            'languages' => [
                ['languageId' => 0, 'title' => 'English', 'locale' => 'en_US.UTF-8', 'base' => '/', 'flag' => 'us'],
                ['languageId' => 1, 'title' => 'Dansk', 'locale' => 'da_DK.UTF-8', 'base' => '/da/', 'flag' => 'dk'],
            ],
        ]);
        $this->writeSiteConfiguration('other', [
            'rootPageId' => 6,
            'base' => '/other/',
            'languages' => [
                ['languageId' => 0, 'title' => 'English', 'locale' => 'en_US.UTF-8', 'base' => '/', 'flag' => 'us'],
                ['languageId' => 2, 'title' => 'Deutsch', 'locale' => 'de_DE.UTF-8', 'base' => '/de/', 'flag' => 'de'],
            ],
        ]);

        // isInWebMount() resolves the rootline with the SHOW permission clause,
        // so the mounted root page needs real perms for the non-admin editor.
        $this->getConnectionPool()->getConnectionForTable('pages')
            ->update('pages', ['perms_everybody' => 15], ['uid' => 1]);
        $editor = $this->setUpBackendUser(2);
        $editor->groupData['webmounts'] = '1';

        $configuration = $this->get(TranslationsTab::class)->getModalConfiguration($this->createContext(null, $editor));

        self::assertSame(
            ['1'],
            array_column($configuration['fields'][0]['options'], 'value'),
            'Languages of sites outside the web mounts must not be offered',
        );
    }

    /**
     * The content element tab spreads its options over one field per wizard
     * group, so value-level assertions need them back in one list.
     *
     * @param array{fields: list<array<string, mixed>>} $configuration
     *
     * @return list<array<string, mixed>>
     */
    private function flattenOptions(array $configuration): array
    {
        $options = [];
        foreach ($configuration['fields'] as $field) {
            array_push($options, ...($field['options'] ?? []));
        }

        return $options;
    }

    /**
     * Minimal, self-contained site configuration writer - avoids coupling the
     * test suite to the core's SiteBasedTestTrait (which lives under
     * typo3/cms-core/Tests and pulls in frontend-request fixtures we do not
     * need for a pure modal-configuration assertion).
     *
     * @param array<string, mixed> $configuration
     */
    private function writeSiteConfiguration(string $identifier, array $configuration): void
    {
        $this->get(SiteWriter::class)->write($identifier, $configuration);
    }

    /**
     * Written straight to the column, not through DataHandler: the assertion is
     * about how page TSconfig is *read* back, and a DataHandler round trip would
     * add nothing but its own failure modes.
     *
     * The cache flush is what makes that shortcut work. Page TSconfig is
     * assembled from the rootline, and both the rootline rows and the parsed
     * TSconfig tree are cached - a bare UPDATE leaves whatever was read during
     * setUp() in place, and the new value is never seen.
     */
    private function setPageTsConfig(int $pageUid, string $tsConfig): void
    {
        $this->get(ConnectionPool::class)
            ->getConnectionForTable('pages')
            ->update('pages', ['TSconfig' => $tsConfig], ['uid' => $pageUid]);

        $cacheManager = $this->get(CacheManager::class);
        foreach (['runtime', 'core'] as $identifier) {
            $cacheManager->getCache($identifier)->flush();
        }
    }
}
