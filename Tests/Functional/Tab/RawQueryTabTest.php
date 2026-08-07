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

use KonradMichalik\PagetreeFacets\Tab\RawQueryTab;
use PHPUnit\Framework\Attributes\Test;

/**
 * RawQueryTabTest.
 *
 * Reuses the ContentElementTab fixture: pages 1..4 with one tt_content
 * record each (200..203, CType "text"/"uploads", one hidden, one deleted).
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RawQueryTabTest extends AbstractTabTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/ContentElementTab.csv');
    }

    #[Test]
    public function findsPagesByExactFieldValue(): void
    {
        // Same result as ce:uploads - hidden counts, deleted does not.
        self::assertSame([2, 3], $this->resolve($this->get(RawQueryTab::class), 'raw:tt_content|CType=uploads'));
    }

    #[Test]
    public function andsMultipleFieldConditions(): void
    {
        self::assertSame([2], $this->resolve($this->get(RawQueryTab::class), 'raw:tt_content|CType=uploads|hidden=0'));
    }

    #[Test]
    public function wildcardSuffixMatchesLike(): void
    {
        self::assertSame([2], $this->resolve($this->get(RawQueryTab::class), 'raw:tt_content|header=*sicher'));
    }

    #[Test]
    public function wildcardPrefixMatchesLike(): void
    {
        self::assertSame([1], $this->resolve($this->get(RawQueryTab::class), 'raw:tt_content|header=Standard*'));
    }

    #[Test]
    public function bareTableWithoutConditionsMatchesAnyRecordOfThatTable(): void
    {
        self::assertSame([1, 2, 3], $this->resolve($this->get(RawQueryTab::class), 'raw:tt_content'));
    }

    #[Test]
    public function findsPagesByRecordUid(): void
    {
        // "uid" has no TCA columns entry - it is allowed as an explicit
        // exception, otherwise the single most obvious raw query would be
        // silently dropped.
        self::assertSame([2], $this->resolve($this->get(RawQueryTab::class), 'raw:tt_content|uid=201'));
    }

    #[Test]
    public function findsThePageItselfWhenQueryingThePagesTableByUid(): void
    {
        self::assertSame([3], $this->resolve($this->get(RawQueryTab::class), 'raw:pages|uid=3'));
    }

    #[Test]
    public function findsThePageItselfWhenQueryingThePagesTableByField(): void
    {
        // Not the parent: for "pages" the matching record is the page. The
        // value carries no space on purpose - whitespace separates tokens.
        self::assertSame([1, 2, 3, 4], $this->resolve($this->get(RawQueryTab::class), 'raw:pages|doktype=1'));
    }

    #[Test]
    public function unknownFieldIsIgnoredRatherThanWideningToAnyRecord(): void
    {
        self::assertSame([], $this->resolve($this->get(RawQueryTab::class), 'raw:tt_content|bogus_field=x'));
    }

    #[Test]
    public function unknownTableYieldsNoMatches(): void
    {
        self::assertSame([], $this->resolve($this->get(RawQueryTab::class), 'raw:unknown_table_xyz|foo=bar'));
    }

    #[Test]
    public function segmentsWithoutAnyValidFieldValuePairResolveToNoMatches(): void
    {
        // "noEqualsSign" has no '=' at all - must not silently widen to "any
        // record of table" the way a bare table (no segments) intentionally does.
        self::assertSame([], $this->resolve($this->get(RawQueryTab::class), 'raw:tt_content|noEqualsSign'));
    }
}
