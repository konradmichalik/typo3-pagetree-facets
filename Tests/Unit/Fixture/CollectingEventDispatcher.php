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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Fixture;

use KonradMichalik\PagetreeFacets\Api\FacetInterface;
use KonradMichalik\PagetreeFacets\Event\RegisterFacetsEvent;
use Psr\EventDispatcher\EventDispatcherInterface;

/**
 * CollectingEventDispatcher.
 *
 * Dispatcher double: registers the given facets on RegisterFacetsEvent.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class CollectingEventDispatcher implements EventDispatcherInterface
{
    /**
     * @param list<array{0: FacetInterface, 1: int}> $registrations
     */
    public function __construct(
        private array $registrations,
    ) {}

    public function dispatch(object $event): object
    {
        if ($event instanceof RegisterFacetsEvent) {
            foreach ($this->registrations as [$facet, $priority]) {
                $event->addFacet($facet, $priority);
            }
        }

        return $event;
    }
}
