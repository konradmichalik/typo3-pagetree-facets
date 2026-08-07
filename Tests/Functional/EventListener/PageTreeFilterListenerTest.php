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
use Psr\EventDispatcher\EventDispatcherInterface;
use TYPO3\CMS\Backend\Controller\Event\AfterPageTreeItemsPreparedEvent;
use TYPO3\CMS\Backend\Dto\Tree\Label\Label;
use TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Database\Query\Expression\CompositeExpression;
use TYPO3\CMS\Core\Http\ServerRequest;
use TYPO3\CMS\Core\Localization\{LanguageService, LanguageServiceFactory};
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

/**
 * PageTreeFilterListenerTest.
 *
 * The Unit suite stubs every tab and service; this covers what cannot be stubbed
 * away: "under:<uid>" wired through the real DI container into
 * PageSubtreeScopeService, which resolves rootlines against a real database, and
 * the hand-over of the hit list to the rendering phase, which only holds if DI
 * really shares one MatchedPageRegistry between both listeners. Fixture tree:
 * Root(1) > Section A(2) > Section A Child(3);
 * Root(1) > Section B(4) > Section B Child(5).
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PageTreeFilterListenerTest extends FunctionalTestCase
{
    protected array $testExtensionsToLoad = [
        'konradmichalik/typo3-pagetree-facets',
    ];

    private LanguageService $languageService;

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/PageSubtreeScopeService.csv');
        $this->importCSVDataSet(__DIR__.'/../Fixtures/be_users.csv');
        $backendUser = $this->setUpBackendUser(1);
        $GLOBALS['BE_USER'] = $backendUser;
        $this->languageService = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($backendUser);
        $GLOBALS['LANG'] = $this->languageService;
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

    #[Test]
    public function theHitsAreHandedToTheLabelListenerButTheRootlineIsNot(): void
    {
        // The other thing no unit test can prove: that both listeners really
        // share one MatchedPageRegistry instance through the DI container, and
        // that SearchResultLabelListener is picked up via #[AsEventListener] at
        // all. Filter first, then let the real dispatcher run the rendering
        // phase over items for the hits (2, 3) plus the rootline page the core
        // renders around them (1).
        $this->get(PageTreeFilterListener::class)($this->createEvent('doktype:1 under:2'));

        $event = new AfterPageTreeItemsPreparedEvent(new ServerRequest(), [
            ['identifier' => '1', '_page' => ['uid' => 1]],
            ['identifier' => '2', '_page' => ['uid' => 2]],
            ['identifier' => '3', '_page' => ['uid' => 3]],
        ]);
        $this->get(EventDispatcherInterface::class)->dispatch($event);

        $items = $event->getItems();
        self::assertArrayNotHasKey('labels', $items[0]);
        self::assertCount(1, $items[1]['labels']);
        self::assertCount(1, $items[2]['labels']);

        $label = $items[1]['labels'][0];
        self::assertInstanceOf(Label::class, $label);
        self::assertSame('#F5A770', $label->color);
    }

    #[Test]
    public function theLabelTextResolvesFromTheExtensionsOwnXlfFile(): void
    {
        // The listener falls back to the English wording when the reference does
        // not resolve, and the fallback is that same string - so nothing else,
        // the E2E specs included, can tell a working reference from a typo.
        // Asserts the v14 translation-domain form the listener passes to sL(),
        // in which locallang_tree.xlf becomes the "<extension>.tree" domain.
        self::assertSame(
            'Matches the filter',
            $this->languageService->sL('typo3_pagetree_facets.tree:tree.match'),
        );
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
