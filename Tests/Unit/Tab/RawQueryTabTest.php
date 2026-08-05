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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Tab;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\ContentQueryHelper;
use KonradMichalik\PagetreeFacets\Tab\RawQueryTab;
use KonradMichalik\PagetreeFacets\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;

/**
 * RawQueryTabTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RawQueryTabTest extends TestCase
{
    /** @var array<string, mixed>|null */
    private ?array $originalTca = null;

    protected function setUp(): void
    {
        $this->originalTca = $GLOBALS['TCA'] ?? null;
        $GLOBALS['TCA'] = [];
    }

    protected function tearDown(): void
    {
        $GLOBALS['TCA'] = $this->originalTca;
    }

    #[Test]
    public function returnsNoUidsForMalformedExpression(): void
    {
        $tab = new RawQueryTab($this->queryHelperThatMustNotBeCalled());

        self::assertSame([], $tab->resolvePageUids(new Token('raw', [''], 'raw:'), $this->context()));
    }

    #[Test]
    public function returnsNoUidsWhenTableUnknownToTca(): void
    {
        $tab = new RawQueryTab($this->queryHelperThatMustNotBeCalled());

        $uids = $tab->resolvePageUids(new Token('raw', ['unknown_table|foo=bar'], 'raw:unknown_table|foo=bar'), $this->context());

        self::assertSame([], $uids);
    }

    #[Test]
    public function returnsNoUidsWhenUserLacksTableSelectPermission(): void
    {
        $GLOBALS['TCA']['tt_content'] = ['columns' => ['CType' => []]];
        $tab = new RawQueryTab($this->queryHelperThatMustNotBeCalled());

        $uids = $tab->resolvePageUids(
            new Token('raw', ['tt_content|CType=image'], 'raw:tt_content|CType=image'),
            $this->context(tablesSelectAllowed: false),
        );

        self::assertSame([], $uids);
    }

    #[Test]
    public function returnsNoUidsWhenAllFieldsAreUnknownToTca(): void
    {
        $GLOBALS['TCA']['tt_content'] = ['columns' => ['CType' => []]];
        $tab = new RawQueryTab($this->queryHelperThatMustNotBeCalled());

        $uids = $tab->resolvePageUids(
            new Token('raw', ['tt_content|bogus_field=x'], 'raw:tt_content|bogus_field=x'),
            $this->context(),
        );

        self::assertSame([], $uids);
    }

    #[Test]
    public function delegatesKnownFieldConditionToQueryHelper(): void
    {
        $GLOBALS['TCA']['tt_content'] = ['columns' => ['CType' => []]];
        $context = $this->context();
        $queryHelper = $this->createMock(ContentQueryHelper::class);
        $queryHelper->expects(self::once())
            ->method('getPageUidsWithFieldMatch')
            ->with('tt_content', ['CType' => 'image'], $context)
            ->willReturn([1, 2, 3]);
        $tab = new RawQueryTab($queryHelper);

        $uids = $tab->resolvePageUids(new Token('raw', ['tt_content|CType=image'], 'raw:tt_content|CType=image'), $context);

        self::assertSame([1, 2, 3], $uids);
    }

    #[Test]
    public function dropsUnknownFieldsButKeepsKnownOnes(): void
    {
        $GLOBALS['TCA']['tt_content'] = ['columns' => ['CType' => []]];
        $context = $this->context();
        $queryHelper = $this->createMock(ContentQueryHelper::class);
        $queryHelper->expects(self::once())
            ->method('getPageUidsWithFieldMatch')
            ->with('tt_content', ['CType' => 'image'], $context)
            ->willReturn([1]);
        $tab = new RawQueryTab($queryHelper);

        $uids = $tab->resolvePageUids(
            new Token('raw', ['tt_content|CType=image|bogus=x'], 'raw:tt_content|CType=image|bogus=x'),
            $context,
        );

        self::assertSame([1], $uids);
    }

    #[Test]
    public function bareTableWithoutConditionsDelegatesEmptyConditions(): void
    {
        $GLOBALS['TCA']['tt_content'] = ['columns' => ['CType' => []]];
        $context = $this->context();
        $queryHelper = $this->createMock(ContentQueryHelper::class);
        $queryHelper->expects(self::once())
            ->method('getPageUidsWithFieldMatch')
            ->with('tt_content', [], $context)
            ->willReturn([5]);
        $tab = new RawQueryTab($queryHelper);

        $uids = $tab->resolvePageUids(new Token('raw', ['tt_content'], 'raw:tt_content'), $context);

        self::assertSame([5], $uids);
    }

    private function queryHelperThatMustNotBeCalled(): ContentQueryHelper&MockObject
    {
        $queryHelper = $this->createMock(ContentQueryHelper::class);
        $queryHelper->expects(self::never())->method('getPageUidsWithFieldMatch');

        return $queryHelper;
    }

    private function context(bool $tablesSelectAllowed = true): FilterContext
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('check')->willReturn($tablesSelectAllowed);

        return new FilterContext($backendUser, 0);
    }
}
