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

namespace KonradMichalik\PagetreeFacets\Event;

use KonradMichalik\PagetreeFacets\Api\FilterTabInterface;

/**
 * RegisterFilterTabsEvent.
 *
 * PSR-14 event: register filter tabs (built-in and third-party alike).
 *
 * Priority convention: built-ins occupy 100..40 (records 100, ce 90,
 * activity 80, doktype 70, state 60, translations 50, seo 40). Third-party
 * tabs default to 0 but may position themselves deliberately.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RegisterFilterTabsEvent
{
    /** @var list<array{tab: FilterTabInterface, priority: int}> */
    private array $tabs = [];

    public function addTab(FilterTabInterface $tab, int $priority = 0): void
    {
        $this->tabs[] = ['tab' => $tab, 'priority' => $priority];
    }

    /**
     * @return list<FilterTabInterface> ordered by priority (desc), stable
     */
    public function getTabs(): array
    {
        $entries = $this->tabs;
        $index = 0;
        $decorated = array_map(static function (array $entry) use (&$index): array {
            return $entry + ['stable' => $index++];
        }, $entries);
        usort($decorated, static fn (array $a, array $b): int => [$b['priority'], $a['stable']] <=> [$a['priority'], $b['stable']]);

        return array_map(static fn (array $entry): FilterTabInterface => $entry['tab'], $decorated);
    }
}
