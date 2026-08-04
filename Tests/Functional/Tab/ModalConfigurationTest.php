<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Tab;

use KonradMichalik\PagetreeFacets\Tab\{ContentElementTab, DoktypeTab, PageStateTab, RecordsTab, TranslationsTab};
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\Configuration\SiteWriter;

use function count;

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

        $configuration = $this->get(ContentElementTab::class)->getModalConfiguration($this->createContext(backendUser: $editor));

        self::assertSame(['textmedia'], array_column($this->flattenOptions($configuration), 'value'));
    }

    #[Test]
    public function doktypeOptionsAreRestrictedByPageTypePermissions(): void
    {
        $editor = $this->setUpBackendUser(2);
        $editor->groupData['pagetypes_select'] = '1';

        $configuration = $this->get(DoktypeTab::class)->getModalConfiguration($this->createContext(backendUser: $editor));

        self::assertSame(['1'], array_column($configuration['fields'][0]['options'], 'value'));
    }

    #[Test]
    public function recordsTableOptionsRespectHideTable(): void
    {
        $configuration = $this->get(RecordsTab::class)->getModalConfiguration($this->createContext());
        $tables = array_column($configuration['fields'][0]['options'], 'value');

        self::assertContains('tt_content', $tables);
        self::assertContains('pages', $tables);
    }

    #[Test]
    public function pageStateOptionsAreComplete(): void
    {
        $configuration = $this->get(PageStateTab::class)->getModalConfiguration($this->createContext());

        self::assertSame(
            ['empty', 'restricted', 'hidden', 'timed', 'editlocked'],
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
}
