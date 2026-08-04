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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\EventListener;

use KonradMichalik\PagetreeFacets\EventListener\PageTreeFilterListener;
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Database\Query\Expression\CompositeExpression;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

/**
 * PageTreeFilterListenerTest.
 *
 * The Unit suite stubs every tab and service; this covers the one thing that
 * cannot be stubbed away - "under:<uid>" wired through the real DI container
 * into PageSubtreeScopeService, which resolves rootlines against a real
 * database. Fixture tree: Root(1) > Section A(2) > Section A Child(3);
 * Root(1) > Section B(4) > Section B Child(5).
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PageTreeFilterListenerTest extends FunctionalTestCase
{
    protected array $testExtensionsToLoad = [
        'konradmichalik/typo3-pagetree-facets',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/PageSubtreeScopeService.csv');
        $this->importCSVDataSet(__DIR__.'/../Fixtures/be_users.csv');
        $backendUser = $this->setUpBackendUser(1);
        $GLOBALS['BE_USER'] = $backendUser;
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($backendUser);
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['BE_USER'], $GLOBALS['LANG']);
        parent::tearDown();
    }

    #[Test]
    public function pageScopeNarrowsTheResultToTheGivenSubtree(): void
    {
        $event = $this->createEvent('doktype:1 under:2');
        $this->get(PageTreeFilterListener::class)($event);

        $uids = $event->searchUids;
        sort($uids);
        self::assertSame([2, 3], $uids);
    }

    #[Test]
    public function pageScopeOnAnUnrelatedBranchExcludesEverythingElse(): void
    {
        $event = $this->createEvent('doktype:1 under:4');
        $this->get(PageTreeFilterListener::class)($event);

        $uids = $event->searchUids;
        sort($uids);
        self::assertSame([4, 5], $uids);
    }

    #[Test]
    public function pageScopeAtTheRootIncludesTheWholeTree(): void
    {
        $event = $this->createEvent('doktype:1 under:1');
        $this->get(PageTreeFilterListener::class)($event);

        $uids = $event->searchUids;
        sort($uids);
        self::assertSame([1, 2, 3, 4, 5], $uids);
    }

    private function createEvent(string $phrase): BeforePageTreeIsFilteredEvent
    {
        return new BeforePageTreeIsFilteredEvent(
            CompositeExpression::or(),
            [],
            $phrase,
            $this->get(ConnectionPool::class)->getQueryBuilderForTable('pages'),
        );
    }
}
