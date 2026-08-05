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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Service;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\ContentQueryHelper;
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\{Connection, ConnectionPool};
use TYPO3\CMS\Core\Schema\Field\FieldCollection;
use TYPO3\CMS\Core\Schema\SearchableSchemaFieldsCollector;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

/**
 * ContentQueryHelperTest.
 *
 * Exercises the service directly rather than only indirectly through tabs -
 * getMatchingPageUids() in particular (the engine's freetext resolution) has
 * no tab of its own and is stubbed out in the listener's unit tests.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class ContentQueryHelperTest extends FunctionalTestCase
{
    protected array $testExtensionsToLoad = [
        'konradmichalik/typo3-pagetree-facets',
    ];

    private ContentQueryHelper $subject;
    private FilterContext $context;

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/ContentQueryHelper.csv');
        $this->subject = $this->get(ContentQueryHelper::class);
        $this->context = new FilterContext(self::createStub(BackendUserAuthentication::class), 0);
    }

    #[Test]
    public function matchingPageUidsFindsByTitle(): void
    {
        self::assertSame([2], $this->subject->getMatchingPageUids('Solar', $this->context));
    }

    #[Test]
    public function matchingPageUidsFindsByNumericUidDirectly(): void
    {
        // Neither page's title contains "3" - only the direct uid match applies.
        self::assertSame([3], $this->subject->getMatchingPageUids('3', $this->context));
    }

    #[Test]
    public function matchingPageUidsReturnsNothingForAnEmptyNeedle(): void
    {
        self::assertSame([], $this->subject->getMatchingPageUids('', $this->context));
        self::assertSame([], $this->subject->getMatchingPageUids('   ', $this->context));
    }

    #[Test]
    public function matchingPageUidsReturnsNothingWithoutAnyMatch(): void
    {
        self::assertSame([], $this->subject->getMatchingPageUids('nonexistent-phrase', $this->context));
    }

    #[Test]
    public function pageUidsWithRecordsAcceptsAnArrayParameterWithAnExplicitType(): void
    {
        $uids = $this->subject->getPageUidsWithRecords(
            'tt_content',
            $this->context,
            'CType IN (:ctypes)',
            ['ctypes' => ['text']],
            // Connection::PARAM_STR_ARRAY *is* ArrayParameterType::STRING - going
            // through TYPO3's constant keeps the test on the same path every
            // production caller uses, and off doctrine/dbal's API directly.
            ['ctypes' => Connection::PARAM_STR_ARRAY],
        );
        sort($uids);

        // uid 200 (visible) qualifies; uid 201's tt_content row is deleted.
        self::assertSame([2], $uids);
    }

    #[Test]
    public function pageUidsWithRecordsWithoutMatchingRowsIsEmpty(): void
    {
        self::assertSame([], $this->subject->getPageUidsWithRecords('tt_content', $this->context, 'CType = \'nonexistent\''));
    }

    #[Test]
    public function textMatchReturnsNothingForAnEmptyNeedle(): void
    {
        self::assertSame([], $this->subject->getPageUidsWithTextMatch('pages', '', $this->context));
        self::assertSame([], $this->subject->getPageUidsWithTextMatch('pages', '   ', $this->context));
    }

    #[Test]
    public function textMatchReturnsNothingWhenTheTableHasNoSearchableFields(): void
    {
        $subject = new ContentQueryHelper($this->get(ConnectionPool::class), $this->noSearchableFields());

        self::assertSame([], $subject->getPageUidsWithTextMatch('pages', 'Solar', $this->context));
    }

    #[Test]
    public function matchingPageUidsReturnsNothingForANonNumericNeedleWithoutSearchableFields(): void
    {
        $subject = new ContentQueryHelper($this->get(ConnectionPool::class), $this->noSearchableFields());

        self::assertSame([], $subject->getMatchingPageUids('nonexistent-and-non-numeric', $this->context));
    }

    private function noSearchableFields(): SearchableSchemaFieldsCollector
    {
        $fieldsCollector = self::createStub(SearchableSchemaFieldsCollector::class);
        $fieldsCollector->method('getFields')->willReturn(new FieldCollection());

        return $fieldsCollector;
    }
}
