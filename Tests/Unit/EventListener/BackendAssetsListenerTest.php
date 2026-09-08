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

use KonradMichalik\PagetreeFacets\EventListener\BackendAssetsListener;
use KonradMichalik\PagetreeFacets\Service\{FacetRegistry, SessionFilterService};
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\CollectingEventDispatcher;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Backend\Controller\Event\AfterBackendPageRenderEvent;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\Exception\ExtensionConfigurationPathDoesNotExistException;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Page\PageRenderer;
use TYPO3\CMS\Core\View\ViewInterface;

/**
 * BackendAssetsListenerTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class BackendAssetsListenerTest extends TestCase
{
    protected function tearDown(): void
    {
        unset($GLOBALS['BE_USER']);
    }

    #[Test]
    public function loadsToolbarAssetsForAnEnabledUser(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser();

        $inlineSettings = [];
        $pageRenderer = self::createMock(PageRenderer::class);
        $pageRenderer->expects(self::once())->method('loadJavaScriptModule')
            ->with('@konradmichalik/pagetree-facets/facets-toolbar.js');
        $pageRenderer->expects(self::once())->method('addCssFile')
            ->with('EXT:typo3_pagetree_facets/Resources/Public/Css/facets-modal.css');
        $pageRenderer->expects(self::once())->method('addInlineLanguageLabelFile')
            ->with('EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf');
        $pageRenderer->method('addInlineSetting')->willReturnCallback(
            static function (string $namespace, string $key, string $value) use (&$inlineSettings): void {
                $inlineSettings[$key] = $value;
            },
        );

        ($this->createListener($pageRenderer))($this->createEvent());

        // Session persistence is off by default; the empty-result notice and the
        // live count preview are both on by default.
        self::assertSame(self::defaultInlineSettings(), $inlineSettings);
    }

    #[Test]
    public function injectsThePersistedFilterWhenSessionPersistenceIsEnabled(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser();

        $inlineSettings = [];
        $pageRenderer = self::createStub(PageRenderer::class);
        $pageRenderer->method('addInlineSetting')->willReturnCallback(
            static function (string $namespace, string $key, string $value) use (&$inlineSettings): void {
                $inlineSettings[$key] = $value;
            },
        );

        ($this->createListener($pageRenderer, '1'))($this->createEvent());

        self::assertSame('1', $inlineSettings['persistFilter'] ?? null);
        self::assertSame('doktype:1', $inlineSettings['persistedFilter'] ?? null);
    }

    #[Test]
    public function announcesTheEmptyResultNoticeUnlessItIsTurnedOff(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser();

        $inlineSettings = [];
        $pageRenderer = self::createStub(PageRenderer::class);
        $pageRenderer->method('addInlineSetting')->willReturnCallback(
            static function (string $namespace, string $key, string $value) use (&$inlineSettings): void {
                $inlineSettings[$key] = $value;
            },
        );

        ($this->createListener($pageRenderer, '0', '0'))($this->createEvent());

        self::assertArrayNotHasKey('emptyResultNotice', $inlineSettings);
    }

    /**
     * The notice hangs off tree lifecycle events the core only dispatches from
     * v14 on (see the class docblock) - it must stay off on v13 even when the
     * extension configuration says it should be on.
     */
    #[Test]
    public function neverAnnouncesTheEmptyResultNoticeOnV13(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser();

        $inlineSettings = [];
        $pageRenderer = self::createStub(PageRenderer::class);
        $pageRenderer->method('addInlineSetting')->willReturnCallback(
            static function (string $namespace, string $key, string $value) use (&$inlineSettings): void {
                $inlineSettings[$key] = $value;
            },
        );

        ($this->createListener($pageRenderer, '0', '1', '1', 13))($this->createEvent());

        self::assertArrayNotHasKey('emptyResultNotice', $inlineSettings);
    }

    #[Test]
    public function announcesTheLivePreviewCountUnlessItIsTurnedOff(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser();

        $inlineSettings = [];
        $pageRenderer = self::createStub(PageRenderer::class);
        $pageRenderer->method('addInlineSetting')->willReturnCallback(
            static function (string $namespace, string $key, string $value) use (&$inlineSettings): void {
                $inlineSettings[$key] = $value;
            },
        );

        ($this->createListener($pageRenderer, '0', '1', '0'))($this->createEvent());

        self::assertArrayNotHasKey('livePreviewCount', $inlineSettings);
    }

    /**
     * Guards the deliberately inverted default for both notice-style settings:
     * unlike the other settings, a missing key must read as "on", so an upgrade
     * from a version without the setting does not silently lose the feature.
     */
    #[Test]
    public function keepsBothNoticeSettingsOnWhenTheirExtensionConfigurationWasNeverWritten(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser();

        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')
            ->willThrowException(new ExtensionConfigurationPathDoesNotExistException());

        $inlineSettings = [];
        $pageRenderer = self::createStub(PageRenderer::class);
        $pageRenderer->method('addInlineSetting')->willReturnCallback(
            static function (string $namespace, string $key, string $value) use (&$inlineSettings): void {
                $inlineSettings[$key] = $value;
            },
        );

        (new BackendAssetsListener(
            $pageRenderer,
            $this->createFacetRegistry(),
            $this->createSessionFilterService(),
            $extensionConfiguration,
            $this->typo3Version(14),
        ))($this->createEvent());

        self::assertSame(self::defaultInlineSettings(), $inlineSettings);
    }

    #[Test]
    public function skipsLoadingAssetsWhenDisabledForTheCurrentUser(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser(['tx_typo3pagetreefacets.' => ['disable' => '1']]);

        $pageRenderer = self::createMock(PageRenderer::class);
        $pageRenderer->expects(self::never())->method('loadJavaScriptModule');
        $pageRenderer->expects(self::never())->method('addCssFile');
        $pageRenderer->expects(self::never())->method('addInlineLanguageLabelFile');

        ($this->createListener($pageRenderer))($this->createEvent());
    }

    #[Test]
    public function skipsLoadingAssetsWithoutAnAuthenticatedBackendUser(): void
    {
        $pageRenderer = self::createMock(PageRenderer::class);
        $pageRenderer->expects(self::never())->method('loadJavaScriptModule');

        ($this->createListener($pageRenderer))($this->createEvent());
    }

    /**
     * The inline settings a default installation publishes on v14, the version
     * every test in this file targets unless it explicitly injects a v13
     * Typo3Version.
     *
     * @return array<string, string>
     */
    private static function defaultInlineSettings(): array
    {
        return ['emptyResultNotice' => '1', 'livePreviewCount' => '1'];
    }

    private function createListener(
        PageRenderer $pageRenderer,
        string $persistFilter = '0',
        string $emptyResultNotice = '1',
        string $livePreviewCount = '1',
        int $typo3MajorVersion = 14,
    ): BackendAssetsListener {
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willReturnCallback(
            static fn (string $extension, string $path = ''): string => match ($path) {
                'emptyResultNotice' => $emptyResultNotice,
                'livePreviewCount' => $livePreviewCount,
                default => '',
            },
        );

        return new BackendAssetsListener(
            $pageRenderer,
            $this->createFacetRegistry(),
            $this->createSessionFilterService($persistFilter),
            $extensionConfiguration,
            $this->typo3Version($typo3MajorVersion),
        );
    }

    private function typo3Version(int $majorVersion): Typo3Version
    {
        return new class($majorVersion) extends Typo3Version {
            public function __construct(private readonly int $major) {}

            public function getMajorVersion(): int
            {
                return $this->major;
            }
        };
    }

    private function createEvent(): AfterBackendPageRenderEvent
    {
        return new AfterBackendPageRenderEvent('', self::createStub(ViewInterface::class));
    }

    private function createFacetRegistry(): FacetRegistry
    {
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willReturn('');

        return new FacetRegistry(new CollectingEventDispatcher([]), $extensionConfiguration);
    }

    private function createSessionFilterService(string $persistFilter = '0'): SessionFilterService
    {
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willReturn($persistFilter);

        return new SessionFilterService($extensionConfiguration);
    }

    /**
     * @param array<string, mixed> $tsConfig
     */
    private function createBackendUser(array $tsConfig = []): BackendUserAuthentication&Stub
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getTSConfig')->willReturn($tsConfig);
        $backendUser->method('isAdmin')->willReturn(true);
        $backendUser->method('getSessionData')->willReturn('doktype:1');

        return $backendUser;
    }
}
