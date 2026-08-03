<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Service;

use KonradMichalik\PagetreeFacets\Service\PageSubtreeScopeService;
use PHPUnit\Framework\Attributes\Test;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

/**
 * PageSubtreeScopeServiceTest.
 *
 * Fixture tree: Root(1) > Section A(2) > Section A Child(3); Root(1) >
 * Section B(4) > Section B Child(5).
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PageSubtreeScopeServiceTest extends FunctionalTestCase
{
    protected array $testExtensionsToLoad = [
        'konradmichalik/typo3-pagetree-facets',
    ];

    private PageSubtreeScopeService $subject;

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/PageSubtreeScopeService.csv');
        $this->subject = $this->get(PageSubtreeScopeService::class);
    }

    #[Test]
    public function scopePageItselfAndItsDescendantsAreIncluded(): void
    {
        self::assertSame([2, 3], $this->subject->filterUidsUnderPage([2, 3, 4, 5], 2));
    }

    #[Test]
    public function unrelatedBranchesAreExcluded(): void
    {
        self::assertSame([4, 5], $this->subject->filterUidsUnderPage([2, 3, 4, 5], 4));
    }

    #[Test]
    public function scopingToTheRootPageIncludesEverything(): void
    {
        self::assertSame([2, 3, 4, 5], $this->subject->filterUidsUnderPage([2, 3, 4, 5], 1));
    }

    #[Test]
    public function emptyInputReturnsEmpty(): void
    {
        self::assertSame([], $this->subject->filterUidsUnderPage([], 2));
    }
}
