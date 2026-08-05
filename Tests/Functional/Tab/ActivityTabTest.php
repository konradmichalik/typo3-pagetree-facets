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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Tab;

use KonradMichalik\PagetreeFacets\Tab\ActivityTab;
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
        // User 1 modified uid 4 and created uid 3 - "edited by" must only report
        // the modification, or the label promises something it does not deliver.
        self::assertSame([4], $this->resolve($this->get(ActivityTab::class), 'by:1'));
    }

    #[Test]
    public function createdByResolvesTheHistoryInsertAction(): void
    {
        self::assertSame([3], $this->resolve($this->get(ActivityTab::class), 'createdby:1'));
    }

    #[Test]
    public function editedAndCreatedByAreScopedToTheGivenUser(): void
    {
        self::assertSame([2], $this->resolve($this->get(ActivityTab::class), 'by:2'));
        self::assertSame([], $this->resolve($this->get(ActivityTab::class), 'createdby:2'));
    }

    #[Test]
    public function anInvalidPresetFormatResolvesToNoMatches(): void
    {
        self::assertSame([], $this->resolve($this->get(ActivityTab::class), 'updated:bogus'));
        self::assertSame([], $this->resolve($this->get(ActivityTab::class), 'created:bogus'));
    }

    #[Test]
    public function byIgnoresANonPositiveUserId(): void
    {
        self::assertSame([], $this->resolve($this->get(ActivityTab::class), 'by:0'));
    }

    #[Test]
    public function monthPresetUnitCalculatesTheThreshold(): void
    {
        // Same fresh/stale fixture semantics as the day-based preset above -
        // only the unit conversion ('m' => 86400 * 30) differs.
        self::assertSame([2], $this->resolve($this->get(ActivityTab::class), 'created:<1m'));
    }
}
