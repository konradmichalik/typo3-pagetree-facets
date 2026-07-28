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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Tab;

use KonradMichalik\PagetreeFacets\Tab\{ContentElementTab, RecordsTab};
use PHPUnit\Framework\Attributes\Test;


/**
 * ContentElementTabTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */

final class ContentElementTabTest extends AbstractTabTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/ContentElementTab.csv');
    }

    #[Test]
    public function findsPagesContainingCType(): void
    {
        self::assertSame([2, 3], $this->resolve($this->get(ContentElementTab::class), 'ce:uploads'));
    }

    #[Test]
    public function commaValuesAreOrCombined(): void
    {
        self::assertSame([1, 2, 3], $this->resolve($this->get(ContentElementTab::class), 'ce:text,uploads'));
    }

    #[Test]
    public function hiddenElementsCountButDeletedOnesDoNot(): void
    {
        // uid 3 only has a HIDDEN uploads element -> counts. uid 4 only has a
        // DELETED uploads element -> does not count.
        $uids = $this->resolve($this->get(ContentElementTab::class), 'ce:uploads');
        self::assertContains(3, $uids);
        self::assertNotContains(4, $uids);
    }

    #[Test]
    public function tableTokenFindsPagesWithRecordsOfTable(): void
    {
        self::assertSame([1, 2, 3], $this->resolve($this->get(RecordsTab::class), 'table:tt_content'));
    }

    #[Test]
    public function recordTokenFindsThePageOfOneRecord(): void
    {
        self::assertSame([2], $this->resolve($this->get(RecordsTab::class), 'record:tt_content:201'));
    }

    #[Test]
    public function textTokenSearchesTcaSearchFields(): void
    {
        self::assertSame([3], $this->resolve($this->get(RecordsTab::class), 'text:Jahresbericht'));
    }

    #[Test]
    public function textTokenEscapesLikeWildcards(): void
    {
        // "100%" must be matched literally, not as LIKE wildcard.
        self::assertSame([2], $this->resolve($this->get(RecordsTab::class), 'text:100%'));
    }
}
