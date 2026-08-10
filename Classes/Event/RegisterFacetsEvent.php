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

use KonradMichalik\PagetreeFacets\Api\FacetInterface;

/**
 * RegisterFacetsEvent.
 *
 * PSR-14 event: register filter facets (built-in and third-party alike).
 *
 * Priority convention: built-ins occupy 100..40 (ce 100, records 90,
 * activity 80, doktype 70, state 60, translations 50, seo 40). Third-party
 * facets default to 0 but may position themselves deliberately.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RegisterFacetsEvent
{
    /** @var list<array{facet: FacetInterface, priority: int}> */
    private array $facets = [];

    public function addFacet(FacetInterface $facet, int $priority = 0): void
    {
        $this->facets[] = ['facet' => $facet, 'priority' => $priority];
    }

    /**
     * @return list<FacetInterface> ordered by priority (desc), stable
     */
    public function getFacets(): array
    {
        $entries = $this->facets;
        $index = 0;
        $decorated = array_map(static function (array $entry) use (&$index): array {
            return $entry + ['stable' => $index++];
        }, $entries);
        usort($decorated, static fn (array $a, array $b): int => [$b['priority'], $a['stable']] <=> [$a['priority'], $b['stable']]);

        return array_map(static fn (array $entry): FacetInterface => $entry['facet'], $decorated);
    }
}
