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

use KonradMichalik\PagetreeFacets\Event\RegisterFilterOptionsEvent;
use KonradMichalik\PagetreeFacets\Option\Seo\{MissingDescriptionOption, NofollowOption, NoindexOption};
use KonradMichalik\PagetreeFacets\Option\State\{EditlockedStateOption, EmptyStateOption, HiddenInMenuStateOption, HiddenStateOption, RestrictedStateOption, TimedStateOption};
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Utility\ExtensionManagementUtility;

/**
 * BuiltInOptionsListener.
 *
 * Dogfooding: the built-in page-state and SEO values register through the same
 * public event a third party would use - no private shortcut, matching how
 * BuiltInTabsListener handles tabs. Priorities order each value within its
 * checkbox group; the ranges mirror the previously hardcoded option lists.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(identifier: 'pagetree-facets/built-in-options')]
final readonly class BuiltInOptionsListener
{
    public function __construct(
        private EmptyStateOption $emptyStateOption,
        private RestrictedStateOption $restrictedStateOption,
        private HiddenStateOption $hiddenStateOption,
        private HiddenInMenuStateOption $hiddenInMenuStateOption,
        private TimedStateOption $timedStateOption,
        private EditlockedStateOption $editlockedStateOption,
        private NoindexOption $noindexOption,
        private NofollowOption $nofollowOption,
        private MissingDescriptionOption $missingDescriptionOption,
    ) {}

    public function __invoke(RegisterFilterOptionsEvent $event): void
    {
        // Page state ("is"): order matches the previous hardcoded checkbox list.
        $event->addOption($this->emptyStateOption, 100);
        $event->addOption($this->restrictedStateOption, 90);
        $event->addOption($this->hiddenStateOption, 80);
        $event->addOption($this->hiddenInMenuStateOption, 70);
        $event->addOption($this->timedStateOption, 60);
        $event->addOption($this->editlockedStateOption, 50);
        // SEO ("seo"): the fields these query (no_index/no_follow/description)
        // only exist with EXT:seo installed - mirror SeoTab's own guard so a
        // seo: token stays unresolved rather than erroring without the fields.
        if (ExtensionManagementUtility::isLoaded('seo')) {
            $event->addOption($this->noindexOption, 40);
            $event->addOption($this->nofollowOption, 30);
            $event->addOption($this->missingDescriptionOption, 20);
        }
    }
}
