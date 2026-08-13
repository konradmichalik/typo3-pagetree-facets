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

use KonradMichalik\PagetreeFacets\Event\RegisterFacetsEvent;
use KonradMichalik\PagetreeFacets\Tab\{ActivityTab, ContentElementTab, DoktypeTab, FormTab, LayoutTab, PageStateTab, RawQueryTab, RecordsTab, SeoTab, TranslationsTab};
use Throwable;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;
use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

/**
 * BuiltInTabsListener.
 *
 * Dogfooding: every built-in facet registers through the same public event a
 * third party would use - no private shortcut. Priority ranges 100..40 are
 * reserved for built-ins; third-party facets default to 0.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(identifier: 'pagetree-facets/built-in-tabs')]
final readonly class BuiltInTabsListener
{
    public function __construct(
        private ContentElementTab $contentElementTab,
        private RecordsTab $recordsTab,
        private ActivityTab $activityTab,
        private DoktypeTab $doktypeTab,
        private LayoutTab $layoutTab,
        private FormTab $formTab,
        private PageStateTab $pageStateTab,
        private TranslationsTab $translationsTab,
        private SeoTab $seoTab,
        private RawQueryTab $rawQueryTab,
        private ExtensionConfiguration $extensionConfiguration,
    ) {}

    public function __invoke(RegisterFacetsEvent $event): void
    {
        $event->addFacet($this->contentElementTab, 100);
        $event->addFacet($this->recordsTab, 90);
        $event->addFacet($this->activityTab, 80);
        $event->addFacet($this->doktypeTab, 70);
        // 65, not a fresh multiple of ten: layout belongs directly next to
        // doktype in the "content" group, and slotting it in beats renumbering
        // every built-in below it.
        $event->addFacet($this->layoutTab, 65);
        $event->addFacet($this->pageStateTab, 60);
        $event->addFacet($this->translationsTab, 50);
        // Conditional registration: the "form:" token needs a
        // form_formframework element to exist at all, which needs EXT:form.
        if (ExtensionManagementUtility::isLoaded('form')) {
            $event->addFacet($this->formTab, 45);
        }
        // Conditional registration: seo fields only exist with EXT:seo.
        if (ExtensionManagementUtility::isLoaded('seo')) {
            $event->addFacet($this->seoTab, 40);
        }
        // Conditional registration: the raw:-token escape hatch is opt-in
        // and off by default - arbitrary field=value matching against any
        // TCA table is a deliberate power-user/security tradeoff, see the
        // extension setting's description.
        if ($this->isRawQueryTabEnabled()) {
            $event->addFacet($this->rawQueryTab, 10);
        }
    }

    private function isRawQueryTabEnabled(): bool
    {
        try {
            return (bool) $this->extensionConfiguration->get('typo3_pagetree_facets', 'enableRawQueryTab');
        } catch (Throwable) {
            return false;
        }
    }
}
