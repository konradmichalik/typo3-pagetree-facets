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

use KonradMichalik\PagetreeLens\Event\RegisterFilterTabsEvent;
use KonradMichalik\PagetreeLens\Tab\ActivityTab;
use KonradMichalik\PagetreeLens\Tab\ContentElementTab;
use KonradMichalik\PagetreeLens\Tab\DoktypeTab;
use KonradMichalik\PagetreeLens\Tab\PageStateTab;
use KonradMichalik\PagetreeLens\Tab\RecordsTab;
use KonradMichalik\PagetreeLens\Tab\SeoTab;
use KonradMichalik\PagetreeLens\Tab\TranslationsTab;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

/**
 * Dogfooding: every built-in tab registers through the same public event a
 * third party would use - no private shortcut. Priority ranges 100..40 are
 * reserved for built-ins; third-party tabs default to 0.
 */
#[AsEventListener(identifier: 'pagetree-lens/built-in-tabs')]
final class BuiltInTabsListener
{
    public function __construct(
        private readonly RecordsTab $recordsTab,
        private readonly ContentElementTab $contentElementTab,
        private readonly ActivityTab $activityTab,
        private readonly DoktypeTab $doktypeTab,
        private readonly PageStateTab $pageStateTab,
        private readonly TranslationsTab $translationsTab,
        private readonly SeoTab $seoTab,
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
