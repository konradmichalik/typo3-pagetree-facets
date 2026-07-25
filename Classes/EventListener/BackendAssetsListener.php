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

namespace KonradMichalik\PagetreeLens\EventListener;

use KonradMichalik\PagetreeLens\Service\TabRegistry;
use TYPO3\CMS\Backend\Controller\Event\AfterBackendPageRenderEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Page\PageRenderer;

/**
 * Loads the toolbar module into the backend shell. Without this listener the
 * extension would install fine and do exactly nothing visible.
 *
 * Loaded once for the outer backend document (where the page tree lives);
 * skipped entirely for users with the feature disabled, so they pay zero
 * JS cost.
 */
#[AsEventListener(identifier: 'pagetree-lens/backend-assets')]
final class BackendAssetsListener
{
    public function __construct(
        private readonly PageRenderer $pageRenderer,
        private readonly TabRegistry $tabRegistry,
    ) {}

    public function __invoke(AfterBackendPageRenderEvent $event): void
    {
        $backendUser = $GLOBALS['BE_USER'] ?? null;
        if (!$backendUser instanceof BackendUserAuthentication
            || $this->tabRegistry->isDisabledForUser($backendUser)
        ) {
            return;
        }
        $this->pageRenderer->loadJavaScriptModule('@konradmichalik/pagetree-lens/lens-toolbar.js');
    }
}
