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

use KonradMichalik\PagetreeFacets\Tab\PageStateTab;
use PHPUnit\Framework\Attributes\Test;

/**
 * PageStateTabTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PageStateTabTest extends AbstractTabTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/PageStateTab.csv');
    }

    #[Test]
    public function emptyMeansNoContentElementsButCountsHiddenOnes(): void
    {
        // uid 2 has no tt_content at all; uid 3 has one HIDDEN element and is
        // therefore NOT empty; folder uid 4 is excluded by doktype; deleted
        // page uid 5 is excluded entirely.
        self::assertSame([2], $this->resolve($this->get(PageStateTab::class), 'is:empty'));
    }

    #[Test]
    public function emptyIgnoresPagesShowingContentFromElsewhere(): void
    {
        // uid 12 owns no tt_content but renders another page's content, so it is
        // not a page anybody needs to go and fill.
        self::assertNotContains(12, $this->resolve($this->get(PageStateTab::class), 'is:empty'));
    }

    #[Test]
    public function hiddenInMenuIsItsOwnStateSeparateFromHidden(): void
    {
        self::assertSame([11], $this->resolve($this->get(PageStateTab::class), 'is:hidden-in-menu'));
        // uid 11 is visible, just not in menus - is:hidden must not claim it.
        self::assertSame([8], $this->resolve($this->get(PageStateTab::class), 'is:hidden'));
    }

    #[Test]
    public function restrictedMatchesFeGroupAndExtendToSubpages(): void
    {
        self::assertSame([6, 7], $this->resolve($this->get(PageStateTab::class), 'is:restricted'));
    }

    #[Test]
    public function hiddenTimedAndEditlockedFlagsResolve(): void
    {
        self::assertSame([8], $this->resolve($this->get(PageStateTab::class), 'is:hidden'));
        self::assertSame([9], $this->resolve($this->get(PageStateTab::class), 'is:timed'));
        self::assertSame([10], $this->resolve($this->get(PageStateTab::class), 'is:editlocked'));
    }

    #[Test]
    public function commaValuesAreOrCombined(): void
    {
        self::assertSame([2, 8], $this->resolve($this->get(PageStateTab::class), 'is:empty,hidden'));
    }
}
