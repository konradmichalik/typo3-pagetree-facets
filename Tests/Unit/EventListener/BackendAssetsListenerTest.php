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
use KonradMichalik\PagetreeFacets\Service\TabRegistry;
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\CollectingEventDispatcher;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Backend\Controller\Event\AfterBackendPageRenderEvent;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;
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

        $pageRenderer = self::createMock(PageRenderer::class);
        $pageRenderer->expects(self::once())->method('loadJavaScriptModule')
            ->with('@konradmichalik/pagetree-facets/facets-toolbar.js');
        $pageRenderer->expects(self::once())->method('addCssFile')
            ->with('EXT:typo3_pagetree_facets/Resources/Public/Css/facets-modal.css');
        $pageRenderer->expects(self::once())->method('addInlineLanguageLabelFile')
            ->with('EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf');

        (new BackendAssetsListener($pageRenderer, $this->createTabRegistry()))($this->createEvent());
    }

    #[Test]
    public function skipsLoadingAssetsWhenDisabledForTheCurrentUser(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser(['tx_typo3pagetreefacets.' => ['disable' => '1']]);

        $pageRenderer = self::createMock(PageRenderer::class);
        $pageRenderer->expects(self::never())->method('loadJavaScriptModule');
        $pageRenderer->expects(self::never())->method('addCssFile');
        $pageRenderer->expects(self::never())->method('addInlineLanguageLabelFile');

        (new BackendAssetsListener($pageRenderer, $this->createTabRegistry()))($this->createEvent());
    }

    #[Test]
    public function skipsLoadingAssetsWithoutAnAuthenticatedBackendUser(): void
    {
        $pageRenderer = self::createMock(PageRenderer::class);
        $pageRenderer->expects(self::never())->method('loadJavaScriptModule');

        (new BackendAssetsListener($pageRenderer, $this->createTabRegistry()))($this->createEvent());
    }

    private function createEvent(): AfterBackendPageRenderEvent
    {
        return new AfterBackendPageRenderEvent('', self::createStub(ViewInterface::class));
    }

    private function createTabRegistry(): TabRegistry
    {
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willReturn('');

        return new TabRegistry(new CollectingEventDispatcher([]), $extensionConfiguration);
    }

    /**
     * @param array<string, mixed> $tsConfig
     */
    private function createBackendUser(array $tsConfig = []): BackendUserAuthentication&Stub
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getTSConfig')->willReturn($tsConfig);
        $backendUser->method('isAdmin')->willReturn(true);

        return $backendUser;
    }
}
