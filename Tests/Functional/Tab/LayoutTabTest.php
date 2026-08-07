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

use KonradMichalik\PagetreeFacets\Tab\LayoutTab;
use KonradMichalik\PagetreeFacets\Token\Token;
use PHPUnit\Framework\Attributes\Test;

/**
 * LayoutTabTest.
 *
 * Fixture: page 1 sets backend_layout_next_level=10 but no own layout, so it
 * is the page that proves inheritance is NOT resolved - only the field on the
 * page itself counts.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class LayoutTabTest extends AbstractTabTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/LayoutRecords.csv');
        $this->importCSVDataSet(__DIR__.'/../Fixtures/LayoutTab.csv');
    }

    #[Test]
    public function findsPagesByRecordBasedLayout(): void
    {
        self::assertSame([2], $this->resolve($this->get(LayoutTab::class), 'layout:10'));
    }

    #[Test]
    public function findsPagesByPageTsBasedLayout(): void
    {
        self::assertSame([3], $this->resolve($this->get(LayoutTab::class), 'layout:pagets__special'));
    }

    #[Test]
    public function commaValuesAreOrCombined(): void
    {
        self::assertSame([2, 3], $this->resolve($this->get(LayoutTab::class), 'layout:10,pagets__special'));
    }

    #[Test]
    public function findsPagesWithLayoutExplicitlySetToNone(): void
    {
        self::assertSame([5], $this->resolve($this->get(LayoutTab::class), 'layout:-1'));
    }

    #[Test]
    public function inheritedLayoutIsNotAMatch(): void
    {
        // Page 1 hands layout 10 down via backend_layout_next_level and page 4
        // inherits it, but neither has backend_layout set - only page 2 has.
        self::assertSame([2], $this->resolve($this->get(LayoutTab::class), 'layout:10'));
    }

    #[Test]
    public function deletedPagesAreExcluded(): void
    {
        // uid 6 carries layout 10 but is deleted.
        self::assertNotContains(6, $this->resolve($this->get(LayoutTab::class), 'layout:10'));
    }

    #[Test]
    public function unknownLayoutYieldsNoMatches(): void
    {
        self::assertSame([], $this->resolve($this->get(LayoutTab::class), 'layout:pagets__does_not_exist'));
    }

    #[Test]
    public function emptyValueResolvesToNoMatchesRatherThanMatchingUnsetPages(): void
    {
        // "layout:" must not degenerate into "every page without a layout" -
        // an empty criterion is no criterion.
        self::assertSame([], $this->get(LayoutTab::class)->resolvePageUids(
            new Token('layout', [''], 'layout:'),
            $this->createContext(),
        ));
    }

    #[Test]
    public function findsPagesByFrontendLayout(): void
    {
        self::assertSame([2, 5], $this->resolve($this->get(LayoutTab::class), 'pagelayout:1'));
    }

    #[Test]
    public function frontendLayoutIsAnIndependentCriterionFromTheBackendLayout(): void
    {
        // Page 5 shares frontend layout 1 with page 2 but has backend_layout
        // "-1" - the two token keys must not read the same column.
        self::assertSame([3], $this->resolve($this->get(LayoutTab::class), 'pagelayout:2'));
    }

    #[Test]
    public function unknownTokenKeyResolvesToNoMatches(): void
    {
        self::assertSame([], $this->get(LayoutTab::class)->resolvePageUids(
            new Token('nope', ['1'], 'nope:1'),
            $this->createContext(),
        ));
    }
}
