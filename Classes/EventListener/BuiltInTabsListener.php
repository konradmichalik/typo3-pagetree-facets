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

namespace KonradMichalik\PagetreeFacets\EventListener;

use KonradMichalik\PagetreeFacets\Event\RegisterFilterTabsEvent;
use KonradMichalik\PagetreeFacets\Tab\{ActivityTab, ContentElementTab, DoktypeTab, PageStateTab, RecordsTab, SeoTab, TranslationsTab};
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

/**
 * BuiltInTabsListener.
 *
 * Dogfooding: every built-in tab registers through the same public event a
 * third party would use - no private shortcut. Priority ranges 100..40 are
 * reserved for built-ins; third-party tabs default to 0.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(identifier: 'pagetree-facets/built-in-tabs')]
final readonly class BuiltInTabsListener
{
    public function __construct(
        private RecordsTab $recordsTab,
        private ContentElementTab $contentElementTab,
        private ActivityTab $activityTab,
        private DoktypeTab $doktypeTab,
        private PageStateTab $pageStateTab,
        private TranslationsTab $translationsTab,
        private SeoTab $seoTab,
    ) {}

    public function __invoke(RegisterFilterTabsEvent $event): void
    {
        $event->addTab($this->recordsTab, 100);
        $event->addTab($this->contentElementTab, 90);
        $event->addTab($this->activityTab, 80);
        $event->addTab($this->doktypeTab, 70);
        $event->addTab($this->pageStateTab, 60);
        $event->addTab($this->translationsTab, 50);
        // Conditional registration: seo fields only exist with EXT:seo.
        if (ExtensionManagementUtility::isLoaded('seo')) {
            $event->addTab($this->seoTab, 40);
        }
    }
}
