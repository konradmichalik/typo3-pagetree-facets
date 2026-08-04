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

use KonradMichalik\PagetreeFacets\Service\TabRegistry;
use TYPO3\CMS\Backend\Controller\Event\AfterBackendPageRenderEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
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
        private TabRegistry $tabRegistry,
    ) {}

    public function __invoke(AfterBackendPageRenderEvent $event): void
    {
        $backendUser = $GLOBALS['BE_USER'] ?? null;
        if (!$backendUser instanceof BackendUserAuthentication
            || $this->tabRegistry->isDisabledForUser($backendUser)
        ) {
            return;
        }
        $this->pageRenderer->loadJavaScriptModule('@konradmichalik/pagetree-facets/facets-toolbar.js');
        $this->pageRenderer->addCssFile('EXT:typo3_pagetree_facets/Resources/Public/Css/facets-modal.css');
        // The modal chrome (title, buttons, placeholders) is rendered client
        // side and reads its labels from TYPO3.lang - publish them inline.
        $this->pageRenderer->addInlineLanguageLabelFile('EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf');
    }
}
