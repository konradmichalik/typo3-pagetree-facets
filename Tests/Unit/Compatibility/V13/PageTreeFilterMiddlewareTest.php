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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Compatibility\V13;

use KonradMichalik\PagetreeFacets\Compatibility\V13\PageTreeFilterMiddleware;
use KonradMichalik\PagetreeFacets\Service\MatchedPageRegistry;
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\{BuildsTreeFilterResolver, RecordingRequestHandler};
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Backend\Routing\Route;
use TYPO3\CMS\Core\Http\ServerRequest;

/**
 * PageTreeFilterMiddlewareTest.
 *
 * The v13 adapter contract. The resolution itself is the same engine the v14
 * listener test drives (shared via BuildsTreeFilterResolver), so what is
 * asserted here is only the translation: which requests are touched at all, what
 * the rewritten phrase looks like, and the two cases that must never reach
 * TreeController unchanged.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PageTreeFilterMiddlewareTest extends TestCase
{
    use BuildsTreeFilterResolver;

    /**
     * Mirrors PageTreeFilterMiddleware::NO_MATCH_SENTINEL. Duplicated rather
     * than read from the class: the exact string is the contract with the core
     * query, so a test that followed a change to it would assert nothing.
     */
    private const SENTINEL = '#pagetree-facets-no-match#';

    protected function setUp(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser();
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['BE_USER']);
    }

    #[Test]
    public function aResolvedCriterionIsHandedOnAsACommaSeparatedUidList(): void
    {
        $handler = new RecordingRequestHandler();
        $this->createMiddleware()->process($this->createFilterRequest('doktype:1'), $handler);

        // v13's PageTreeRepository::fetchFilteredTree() splits on commas and
        // turns every positive integer into `uid IN (...)`, which is what makes
        // this the whole adapter. The trailing sentinel is not one of them.
        self::assertSame('10,20,30,40,'.self::SENTINEL, $handler->receivedPhrase);
    }

    #[Test]
    public function multipleCriteriaAreIntersectedBeforeRewriting(): void
    {
        $handler = new RecordingRequestHandler();
        $this->createMiddleware()->process($this->createFilterRequest('doktype:1 is:empty'), $handler);

        self::assertSame('20,40,'.self::SENTINEL, $handler->receivedPhrase);
    }

    #[Test]
    public function aSinglePageResultIsStillNotLeftAsABareNumber(): void
    {
        // The reason the sentinel exists. fetchFilteredTree() ORs the UID set
        // with a title LIKE built from the phrase as a whole, so handing it "30"
        // would filter to `uid IN (30) OR title LIKE '%30%'` - every "Room 30"
        // and "1930" would join the result, unmarked, looking like rootline.
        $handler = new RecordingRequestHandler();
        $this->createMiddleware()->process($this->createFilterRequest('is:hidden'), $handler);

        self::assertSame('30,'.self::SENTINEL, $handler->receivedPhrase);
    }

    #[Test]
    public function anEmptyResultBecomesTheSentinelAlone(): void
    {
        // The v14 listener expresses "no matches" as uid 0, which cannot be done
        // here: `uid IN (0)` matches nothing, but `title LIKE '%0%'` next to it
        // matches every page with a zero in its title. The sentinel on its own
        // contributes no UID at all, so the core queries for a title nobody has
        // and TreeController answers with the entry points - the same thing the
        // v14 path produces for a forced no-match.
        $handler = new RecordingRequestHandler();
        $this->createMiddleware()->process($this->createFilterRequest('is:hidden is:empty'), $handler);

        self::assertTrue($handler->wasCalled);
        self::assertSame(self::SENTINEL, $handler->receivedPhrase);
    }

    #[Test]
    public function freetextOnlyReachesTheCoreSearchUnchanged(): void
    {
        $handler = new RecordingRequestHandler();
        $this->createMiddleware()->process($this->createFilterRequest('solar park'), $handler);

        self::assertSame('solar park', $handler->receivedPhrase);
    }

    #[Test]
    public function aPhraseOfOnlyUnknownTokensReachesTheCoreSearchUnchanged(): void
    {
        $handler = new RecordingRequestHandler();
        $this->createMiddleware()->process($this->createFilterRequest('status:3'), $handler);

        self::assertSame('status:3', $handler->receivedPhrase);
    }

    #[Test]
    public function otherBackendRoutesAreNotTouched(): void
    {
        // The middleware sits in the whole backend stack and sees every
        // request; anything but the tree filter route must pass straight
        // through, criteria-looking phrase or not.
        $handler = new RecordingRequestHandler();
        $this->createMiddleware()->process(
            $this->createFilterRequest('doktype:1', 'ajax_page_tree_data'),
            $handler,
        );

        self::assertSame('doktype:1', $handler->receivedPhrase);
    }

    #[Test]
    public function aRequestWithoutARouteAttributeIsNotTouched(): void
    {
        $handler = new RecordingRequestHandler();
        $this->createMiddleware()->process(new ServerRequest('https://example.com/typo3/'), $handler);

        self::assertTrue($handler->wasCalled);
        self::assertNull($handler->receivedPhrase);
    }

    #[Test]
    public function aBlankSearchPhraseIsLeftToTheCore(): void
    {
        // TreeController answers an empty phrase with an empty payload of its
        // own; resolving nothing into "no match" here would be wrong.
        $handler = new RecordingRequestHandler();
        $this->createMiddleware()->process($this->createFilterRequest('   '), $handler);

        self::assertSame('   ', $handler->receivedPhrase);
    }

    #[Test]
    public function theResolvedHitsAreRecordedForTheSearchResultLabel(): void
    {
        $matchedPages = new MatchedPageRegistry();
        $this->createMiddleware($matchedPages)->process(
            $this->createFilterRequest('doktype:1 is:empty'),
            new RecordingRequestHandler(),
        );

        self::assertTrue($matchedPages->isActive());
        self::assertTrue($matchedPages->matches(20));
        // A page the intersection dropped may still be rendered as a rootline
        // ancestor - it must not be marked as a hit.
        self::assertFalse($matchedPages->matches(10));
    }

    #[Test]
    public function nothingIsRecordedWhileTheExtensionIsDisabledForTheUser(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser(['tx_typo3pagetreefacets.' => ['disable' => '1']]);
        $matchedPages = new MatchedPageRegistry();
        $handler = new RecordingRequestHandler();
        $this->createMiddleware($matchedPages)->process($this->createFilterRequest('doktype:1'), $handler);

        self::assertFalse($matchedPages->isActive());
        self::assertSame('doktype:1', $handler->receivedPhrase);
    }

    private function createMiddleware(?MatchedPageRegistry $matchedPages = null): PageTreeFilterMiddleware
    {
        return new PageTreeFilterMiddleware(
            $this->createResolver([], [], [], null, $matchedPages),
        );
    }

    /**
     * Mirrors what the backend stack hands the middleware: the raw phrase in
     * the "q" query parameter, and the matched Route in the "route" attribute
     * (set by typo3/cms-backend/backend-routing).
     */
    private function createFilterRequest(string $phrase, string $routeIdentifier = 'ajax_page_tree_filter'): ServerRequest
    {
        return (new ServerRequest('https://example.com/typo3/ajax/page/tree/filterData'))
            ->withQueryParams(['q' => $phrase])
            ->withAttribute('route', new Route('/page/tree/filterData', ['_identifier' => $routeIdentifier]));
    }
}
