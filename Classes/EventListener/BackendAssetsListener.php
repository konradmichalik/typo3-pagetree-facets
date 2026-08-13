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

namespace KonradMichalik\PagetreeFacets\EventListener;

use KonradMichalik\PagetreeFacets\Service\{FacetRegistry, SessionFilterService};
use Throwable;
use TYPO3\CMS\Backend\Controller\Event\AfterBackendPageRenderEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;
use TYPO3\CMS\Core\Page\PageRenderer;

/**
 * BackendAssetsListener.
 *
 * Loads the toolbar module into the backend shell. Without this listener the
 * extension would install fine and do exactly nothing visible.
 *
 * Loaded once for the outer backend document (where the page tree lives);
 * skipped entirely for users with the feature disabled, so they pay zero
 * JS cost.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(identifier: 'pagetree-facets/backend-assets')]
final readonly class BackendAssetsListener
{
    public function __construct(
        private PageRenderer $pageRenderer,
        private FacetRegistry $facetRegistry,
        private SessionFilterService $sessionFilterService,
        private ExtensionConfiguration $extensionConfiguration,
    ) {}

    public function __invoke(AfterBackendPageRenderEvent $event): void
    {
        $backendUser = $GLOBALS['BE_USER'] ?? null;
        if (!$backendUser instanceof BackendUserAuthentication
            || $this->facetRegistry->isDisabledForUser($backendUser)
        ) {
            return;
        }
        $this->pageRenderer->loadJavaScriptModule('@konradmichalik/pagetree-facets/facets-toolbar.js');
        $this->pageRenderer->addCssFile('EXT:typo3_pagetree_facets/Resources/Public/Css/facets-modal.css');
        // The modal chrome (title, buttons, placeholders) is rendered client
        // side and reads its labels from TYPO3.lang - publish them inline.
        $this->pageRenderer->addInlineLanguageLabelFile('EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf');

        // Optional session persistence (opt-in): expose the flag so the toolbar
        // saves changes back, and the stored phrase so it can restore the tree
        // filter on load. Kept out entirely when the setting is off.
        if ($this->sessionFilterService->isEnabled()) {
            $this->pageRenderer->addInlineSetting('PagetreeFacets', 'persistFilter', '1');
            $this->pageRenderer->addInlineSetting('PagetreeFacets', 'persistedFilter', $this->sessionFilterService->get($backendUser));
        }

        if ($this->isEmptyResultNoticeEnabled()) {
            $this->pageRenderer->addInlineSetting('PagetreeFacets', 'emptyResultNotice', '1');
        }

        if ($this->isLivePreviewCountEnabled()) {
            $this->pageRenderer->addInlineSetting('PagetreeFacets', 'livePreviewCount', '1');
        }
    }

    private function isEmptyResultNoticeEnabled(): bool
    {
        try {
            return (bool) $this->extensionConfiguration->get('typo3_pagetree_facets', 'emptyResultNotice');
        } catch (Throwable) {
            // Defaults to ON, unlike the other settings: a missing key means the
            // value was never written - a fresh install, or an upgrade from
            // before this setting existed - which must not read as "disabled".
            return true;
        }
    }

    private function isLivePreviewCountEnabled(): bool
    {
        try {
            return (bool) $this->extensionConfiguration->get('typo3_pagetree_facets', 'livePreviewCount');
        } catch (Throwable) {
            // Same upgrade-safety default as isEmptyResultNoticeEnabled(): a
            // missing key means the value was never written, which must not
            // read as "disabled".
            return true;
        }
    }
}
