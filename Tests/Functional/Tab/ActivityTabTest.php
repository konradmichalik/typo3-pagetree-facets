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

namespace KonradMichalik\PagetreeLens\Tests\Functional\Tab;

use KonradMichalik\PagetreeLens\Tab\ActivityTab;
use PHPUnit\Framework\Attributes\Test;

/**
 * ActivityTabTest.
 *
 * Fixture timestamps: "fresh" rows use 9999999999 (far future, always inside
 * any <N window), "stale" rows use 1000000000 (2001, always outside).
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class ActivityTabTest extends AbstractTabTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/ActivityTab.csv');
    }

    #[Test]
    public function updatedUsesEffectiveChangeDateIncludingContent(): void
    {
        // uid 2 has a fresh pages.tstamp; uid 3 is stale itself but carries a
        // fresh tt_content record -> both count as recently updated.
        self::assertSame([2, 3], $this->resolve($this->get(ActivityTab::class), 'updated:<7d'));
    }

    #[Test]
    public function untouchedExcludesPagesWithFreshContent(): void
    {
        // uid 3 is stale on the pages record but its content is fresh -> NOT
        // untouched. uid 1 (root) and uid 4 are genuinely stale.
        self::assertSame([1, 4], $this->resolve($this->get(ActivityTab::class), 'updated:>1y'));
    }

    #[Test]
    public function createdComparesTheCrdateField(): void
    {
        self::assertSame([2], $this->resolve($this->get(ActivityTab::class), 'created:<7d'));
    }

    #[Test]
    public function byResolvesPageEditsThroughSysHistory(): void
    {
        self::assertSame([4], $this->resolve($this->get(ActivityTab::class), 'by:1'));
    }
}
