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

namespace KonradMichalik\PagetreeFacets\Compatibility\V13;

use KonradMichalik\PagetreeFacets\Service\TreeFilterResolver;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};
use Psr\Http\Server\{MiddlewareInterface, RequestHandlerInterface};
use TYPO3\CMS\Backend\Routing\Route;

use function implode;
use function is_string;
use function trim;

/**
 * PageTreeFilterMiddleware.
 *
 * The v13 stand-in for BeforePageTreeIsFilteredEvent, which only exists from
 * v14 on. v13 filters the tree in
 * {@see \TYPO3\CMS\Backend\Tree\Repository\PageTreeRepository::fetchFilteredTree()}
 * with no extension point anywhere along the way, so the options were to XCLASS
 * that repository, to swap out TreeController via the container, or to reach the
 * request before it gets there. This is the third: it rewrites one query
 * parameter and touches no core class at all.
 *
 * What makes it work is a property v13's fetchFilteredTree() already has: it
 * splits the search string on commas and turns every positive integer among the
 * parts into `uid IN (...)`, OR-ed with the title/nav_title LIKE. Handing it
 * "12,45,88" therefore yields exactly the page set we resolved - including the
 * rootline expansion and workspace handling that the same method does for the
 * core's own search. The adapter is a string rewrite, not a query rebuild, so
 * nothing has to be kept in sync with core internals.
 *
 * The catch is the title/nav_title LIKE that fetchFilteredTree() ORs onto the
 * UID set and offers no way to drop - the v14 event path neutralizes it, here it
 * runs no matter what. Left alone it silently widens the filter, and the damage
 * scales inversely with the result size: a criterion resolving to the single
 * page 7 is handed on as "7", which the core turns into
 * `uid IN (7) OR title LIKE '%7%'` - every "Chapter 7" and "2007 Archive" joins
 * the result, and because they were never in MatchedPageRegistry they render
 * without a hit stripe, indistinguishable from rootline context. Single-page
 * results are ordinary (`is:shortcut`, a narrow `records:` criterion, `under:`
 * plus a facet), and a low UID makes it worse: a result of page 1 matches almost
 * every title.
 *
 * NO_MATCH_SENTINEL closes that. It is appended to every rewritten phrase, and
 * it is built to be invisible to the UID extraction (trimExplode on commas,
 * then MathUtility::canBeInterpretedAsInteger() and > 0, neither of which it
 * passes) while poisoning the LIKE pattern, which is built from the phrase as a
 * whole. `%7,#pagetree-facets-no-match#%` matches no page title there is.
 *
 * It doubles as the way to say "resolved, matched nothing": the sentinel on its
 * own contributes no UID at all, so the core queries for a title nobody has and
 * TreeController answers with just the entry points - which is exactly what the
 * v14 path produces for its forced no-match, and the reason this middleware
 * hands the request on rather than short-circuiting with a response of its own.
 * Returning early would also skip the four backend middlewares that sit inside
 * this one (compression, CSP and response headers, response propagation), so
 * the one response the extension makes would be the one without them.
 *
 * Registered for the backend stack after site-resolver (see
 * Configuration/RequestMiddlewares.php), because resolving criteria needs an
 * authenticated backend user; that file also makes sure the middleware is not
 * registered at all on v14, where the event path owns this.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class PageTreeFilterMiddleware implements MiddlewareInterface
{
    /**
     * Backend AJAX route that serves the tree's filter input. Routes declared in
     * Configuration/Backend/AjaxRoutes.php are registered with an "ajax_"
     * prefix, so "page_tree_filter" is reached under this identifier.
     */
    private const string FILTER_ROUTE = 'ajax_page_tree_filter';

    /**
     * The query parameter TreeController::filterDataAction() reads the search
     * phrase from.
     */
    private const string SEARCH_PARAM = 'q';

    /**
     * Appended to every rewritten phrase; see the class docblock for why. Must
     * stay something MathUtility::canBeInterpretedAsInteger() rejects, free of
     * commas (the core splits on those), and implausible enough as a substring
     * of a page title that the LIKE it lands in can never match.
     */
    private const string NO_MATCH_SENTINEL = '#pagetree-facets-no-match#';

    public function __construct(
        private TreeFilterResolver $treeFilterResolver,
    ) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $phrase = $this->getSearchPhrase($request);
        if (null === $phrase) {
            return $handler->handle($request);
        }

        $uids = $this->treeFilterResolver->resolve($phrase);
        if (null === $uids) {
            // Not ours - freetext, disabled, or unknown tokens only.
            return $handler->handle($request);
        }

        return $handler->handle($this->withSearchPhrase($request, $this->buildPhrase($uids)));
    }

    /**
     * @param list<int> $uids
     */
    private function buildPhrase(array $uids): string
    {
        // The sentinel is the whole phrase for an empty result: no UID part at
        // all, so the core is left querying for a title nobody has.
        return implode(',', [...$uids, self::NO_MATCH_SENTINEL]);
    }

    // --- Adapter around the core request (single place for core-API coupling) ---

    /**
     * The phrase to filter on, or null if this request is not a tree filter
     * request at all.
     */
    private function getSearchPhrase(ServerRequestInterface $request): ?string
    {
        $route = $request->getAttribute('route');
        if (!$route instanceof Route || self::FILTER_ROUTE !== $route->getOption('_identifier')) {
            return null;
        }

        $phrase = $request->getQueryParams()[self::SEARCH_PARAM] ?? null;
        if (!is_string($phrase) || '' === trim($phrase)) {
            return null;
        }

        return $phrase;
    }

    private function withSearchPhrase(ServerRequestInterface $request, string $phrase): ServerRequestInterface
    {
        $queryParams = $request->getQueryParams();
        $queryParams[self::SEARCH_PARAM] = $phrase;

        return $request->withQueryParams($queryParams);
    }
}
