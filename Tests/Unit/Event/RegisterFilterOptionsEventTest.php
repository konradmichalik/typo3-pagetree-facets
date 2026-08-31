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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Event;

use KonradMichalik\PagetreeFacets\Api\FilterOptionInterface;
use KonradMichalik\PagetreeFacets\Event\RegisterFilterOptionsEvent;
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\StubFilterOption;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * RegisterFilterOptionsEventTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RegisterFilterOptionsEventTest extends TestCase
{
    #[Test]
    public function ordersByPriorityDescendingAndKeepsRegistrationOrderOnTie(): void
    {
        $event = new RegisterFilterOptionsEvent();
        $event->addOption(new StubFilterOption('is', 'third-party-a', []));
        $event->addOption(new StubFilterOption('is', 'built-in', []), 100);
        $event->addOption(new StubFilterOption('is', 'third-party-b', []));

        self::assertSame(
            ['built-in', 'third-party-a', 'third-party-b'],
            array_map(static fn (FilterOptionInterface $option): string => $option->getValue(), $event->getOptions()),
        );
    }

    #[Test]
    public function returnsEmptyListWithoutRegistrations(): void
    {
        self::assertSame([], (new RegisterFilterOptionsEvent())->getOptions());
    }
}
