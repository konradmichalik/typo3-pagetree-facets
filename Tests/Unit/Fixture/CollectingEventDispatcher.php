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

namespace KonradMichalik\PagetreeLens\Tests\Unit\Fixture;

use KonradMichalik\PagetreeLens\Api\FilterTabInterface;
use KonradMichalik\PagetreeLens\Event\RegisterFilterTabsEvent;
use Psr\EventDispatcher\EventDispatcherInterface;

/**
 * CollectingEventDispatcher.
 *
 * Dispatcher double: registers the given tabs on RegisterFilterTabsEvent.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class CollectingEventDispatcher implements EventDispatcherInterface
{
    /**
     * @param list<array{0: FilterTabInterface, 1: int}> $registrations
     */
    public function __construct(
        private readonly array $registrations,
    ) {}

    public function dispatch(object $event): object
    {
        if ($event instanceof RegisterFilterTabsEvent) {
            foreach ($this->registrations as [$tab, $priority]) {
                $event->addTab($tab, $priority);
            }
        }

        return $event;
    }
}
