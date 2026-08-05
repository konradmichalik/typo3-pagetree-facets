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

namespace KonradMichalik\PagetreeFacets\Event;

use KonradMichalik\PagetreeFacets\Api\FilterOptionInterface;

/**
 * RegisterFilterOptionsEvent.
 *
 * PSR-14 event: register individual filter options (built-in and third-party
 * alike) that extend the vocabulary of an existing token key. The sibling of
 * RegisterFilterTabsEvent, with the same priority semantics.
 *
 * Priority convention: built-ins occupy 100..20 (page-state values 100..50,
 * SEO values 40..20). Third-party options default to 0 but may position
 * themselves; priority orders them within their checkbox group.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RegisterFilterOptionsEvent
{
    /** @var list<array{option: FilterOptionInterface, priority: int}> */
    private array $options = [];

    public function addOption(FilterOptionInterface $option, int $priority = 0): void
    {
        $this->options[] = ['option' => $option, 'priority' => $priority];
    }

    /**
     * @return list<FilterOptionInterface> ordered by priority (desc), stable
     */
    public function getOptions(): array
    {
        $entries = $this->options;
        $index = 0;
        $decorated = array_map(static function (array $entry) use (&$index): array {
            return $entry + ['stable' => $index++];
        }, $entries);
        usort($decorated, static fn (array $a, array $b): int => [$b['priority'], $a['stable']] <=> [$a['priority'], $b['stable']]);

        return array_map(static fn (array $entry): FilterOptionInterface => $entry['option'], $decorated);
    }
}
