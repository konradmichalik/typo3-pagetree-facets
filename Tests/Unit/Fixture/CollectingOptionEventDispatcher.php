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

use KonradMichalik\PagetreeFacets\Api\FilterOptionInterface;
use KonradMichalik\PagetreeFacets\Event\RegisterFilterOptionsEvent;
use Psr\EventDispatcher\EventDispatcherInterface;

/**
 * CollectingOptionEventDispatcher.
 *
 * Dispatcher double: registers the given options on RegisterFilterOptionsEvent
 * and counts dispatches, so registry tests can assert the event fires only once.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class CollectingOptionEventDispatcher implements EventDispatcherInterface
{
    public int $dispatchCount = 0;

    /**
     * @param list<array{0: FilterOptionInterface, 1: int}> $registrations
     */
    public function __construct(
        private readonly array $registrations,
    ) {}

    public function dispatch(object $event): object
    {
        if ($event instanceof RegisterFilterOptionsEvent) {
            ++$this->dispatchCount;
            foreach ($this->registrations as [$option, $priority]) {
                $event->addOption($option, $priority);
            }
        }

        return $event;
    }
}
