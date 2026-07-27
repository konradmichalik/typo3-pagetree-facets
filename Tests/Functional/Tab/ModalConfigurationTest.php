<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_lens" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeLens\Tests\Functional\Tab;

use KonradMichalik\PagetreeLens\Tab\{ContentElementTab, DoktypeTab, PageStateTab, RecordsTab, TranslationsTab};
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\Configuration\SiteWriter;

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
        $options = array_column($configuration['fields'][0]['options'], null, 'value');

        self::assertArrayHasKey('textmedia', $options);
        self::assertNotSame('', $options['textmedia']['icon']);
        foreach (array_keys($options) as $value) {
            self::assertStringStartsNotWith('--', (string) $value, 'Divider items must be filtered out');
        }
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
