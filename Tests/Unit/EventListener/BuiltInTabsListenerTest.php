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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\EventListener;

use KonradMichalik\PagetreeFacets\Api\FacetInterface;
use KonradMichalik\PagetreeFacets\Event\RegisterFacetsEvent;
use KonradMichalik\PagetreeFacets\EventListener\BuiltInTabsListener;
use KonradMichalik\PagetreeFacets\Service\{ContentQueryHelper, OptionRegistry};
use KonradMichalik\PagetreeFacets\Tab\{ActivityTab, ContentElementTab, DoktypeTab, LayoutTab, PageStateTab, RawQueryTab, RecordsTab, SeoTab, TranslationsTab};
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Psr\EventDispatcher\EventDispatcherInterface;
use RuntimeException;
use TYPO3\CMS\Backend\View\BackendLayoutView;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Package\PackageManager;
use TYPO3\CMS\Core\Schema\SearchableSchemaFieldsCollector;
use TYPO3\CMS\Core\Site\SiteFinder;
use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

/**
 * BuiltInTabsListenerTest.
 *
 * ExtensionManagementUtility::isLoaded() (used for the EXT:seo conditional)
 * needs a package manager injected - stubbed here so this stays a real unit
 * test instead of needing the functional bootstrap.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class BuiltInTabsListenerTest extends TestCase
{
    protected function setUp(): void
    {
        $packageManager = self::createStub(PackageManager::class);
        $packageManager->method('isPackageActive')->willReturn(false);
        ExtensionManagementUtility::setPackageManager($packageManager);
    }

    #[Test]
    public function rawQueryTabIsNotRegisteredByDefault(): void
    {
        self::assertNotContains('raw', $this->registeredIdentifiers(enableRawQueryTab: false));
    }

    #[Test]
    public function rawQueryTabIsRegisteredWhenExplicitlyEnabled(): void
    {
        self::assertContains('raw', $this->registeredIdentifiers(enableRawQueryTab: true));
    }

    #[Test]
    public function rawQueryTabIsNotRegisteredWhenExtensionConfigurationThrows(): void
    {
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willThrowException(new RuntimeException('broken configuration'));

        self::assertNotContains('raw', $this->registeredIdentifiers(enableRawQueryTab: false, extensionConfiguration: $extensionConfiguration));
    }

    #[Test]
    public function seoTabIsRegisteredWhenExtSeoIsLoaded(): void
    {
        $packageManager = self::createStub(PackageManager::class);
        $packageManager->method('isPackageActive')->willReturnCallback(static fn (string $key): bool => 'seo' === $key);
        ExtensionManagementUtility::setPackageManager($packageManager);

        self::assertContains('seo', $this->registeredIdentifiers(enableRawQueryTab: false));
    }

    /**
     * @return list<string>
     */
    private function registeredIdentifiers(bool $enableRawQueryTab, ?ExtensionConfiguration $extensionConfiguration = null): array
    {
        $queryHelper = new ContentQueryHelper(
            self::createStub(ConnectionPool::class),
            self::createStub(SearchableSchemaFieldsCollector::class),
        );

        $packageManager = self::createStub(PackageManager::class);
        $packageManager->method('getActivePackages')->willReturn([]);

        if (null === $extensionConfiguration) {
            $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
            $extensionConfiguration->method('get')->willReturnCallback(
                static fn (string $extension, string $path = ''): string => 'enableRawQueryTab' === $path ? ($enableRawQueryTab ? '1' : '0') : '',
            );
        }

        // The registry is unused here (only getIdentifier() is called), but the
        // vocabulary tabs now require one - a real instance with a no-op
        // dispatcher avoids mocking the final OptionRegistry.
        $optionRegistry = new OptionRegistry(self::createStub(EventDispatcherInterface::class), $extensionConfiguration);

        $listener = new BuiltInTabsListener(
            new ContentElementTab($queryHelper),
            new RecordsTab($queryHelper, $packageManager),
            new ActivityTab($queryHelper),
            new DoktypeTab($queryHelper),
            new LayoutTab($queryHelper, self::createStub(BackendLayoutView::class), self::createStub(SiteFinder::class)),
            new PageStateTab($queryHelper, $optionRegistry),
            new TranslationsTab($queryHelper, self::createStub(SiteFinder::class)),
            new SeoTab($queryHelper, $optionRegistry),
            new RawQueryTab($queryHelper),
            $extensionConfiguration,
        );

        $event = new RegisterFacetsEvent();
        $listener($event);

        return array_map(static fn (FacetInterface $facet): string => $facet->getIdentifier(), $event->getFacets());
    }
}
