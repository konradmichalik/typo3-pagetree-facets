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

namespace KonradMichalik\PagetreeFacets\Service;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Token\Token;

use function count;

/**
 * FilterResolutionService.
 *
 * The engine's resolve pipeline, extracted from PageTreeFilterListener so the
 * modal's live match-count endpoint (FacetsModalController::count()) can run the
 * exact same criteria resolution the listener applies to the tree, instead of a
 * second, divergent implementation. Per-token facet resolution, hash-based AND
 * intersection, then post-filtering by site and by page-subtree scope - see
 * PageTreeFilterListener's docblock for why both scopes are applied as a
 * post-filter rather than materializing a subtree upfront.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class FilterResolutionService
{
    public function __construct(
        private FacetRegistry $facetRegistry,
        private SiteScopeService $siteScopeService,
        private PageSubtreeScopeService $pageSubtreeScopeService,
        private ContentQueryHelper $queryHelper,
    ) {}

    /**
     * @param list<Token> $tokens
     *
     * @return list<int>|null null = only unknown/scope tokens were given, nothing
     *                        to resolve - the caller decides how to treat "no criteria"
     */
    public function resolve(array $tokens, FilterContext $context): ?array
    {
        $uidSets = $this->resolveUidSets($tokens, $context);
        if ([] === $uidSets) {
            return null;
        }

        $uids = $this->intersect($uidSets);

        // Site scope: post-filter the (small) result set instead of
        // materializing the site subtree upfront.
        if (null !== $context->siteIdentifier && [] !== $uids) {
            $uids = $this->siteScopeService->filterUidsBySite($uids, $context->siteIdentifier);
        }

        // Page scope ("under:<uid>"): same treatment, post-filter by rootline
        // rather than materializing the scope page's subtree upfront.
        $pageScope = $this->extractPageScope($tokens);
        if (null !== $pageScope && [] !== $uids) {
            $uids = $this->pageSubtreeScopeService->filterUidsUnderPage($uids, $pageScope);
        }

        return $uids;
    }

    /**
     * @param list<Token> $tokens
     */
    public function count(array $tokens, FilterContext $context): ?int
    {
        $uids = $this->resolve($tokens, $context);

        return null === $uids ? null : count($uids);
    }

    /**
     * Hash-based AND intersection: array_intersect() sorts both sides
     * (O(n log n) per pair), which adds up on the 10k+ UID sets broad criteria
     * produce. An empty running result ends the loop - every further AND
     * stays empty.
     *
     * @param non-empty-list<list<int>> $uidSets
     *
     * @return list<int>
     */
    private function intersect(array $uidSets): array
    {
        $uids = array_shift($uidSets);
        foreach ($uidSets as $set) {
            if ([] === $uids) {
                break;
            }
            $lookup = array_flip($set);
            $uids = array_values(array_filter($uids, static fn (int $uid): bool => isset($lookup[$uid])));
        }

        return $uids;
    }

    /**
     * Resolve each keyed token to its page-UID set via the owning facet; freetext
     * is resolved by us (pages searchFields LIKE + numeric uid) and intersected
     * like any other criterion, rather than relying on the core's searchParts
     * whose combined OR/AND semantics with our result would be unverified.
     *
     * @param list<Token> $tokens
     *
     * @return list<list<int>>
     */
    private function resolveUidSets(array $tokens, FilterContext $context): array
    {
        // Resolve the (per-user config-filtered) facet set once for the whole
        // phrase and index it by token key, instead of re-running getFacets() via
        // findFacetForToken() for every token. First-seen wins, mirroring the
        // priority order findFacetForToken() would return.
        $facetByKey = [];
        foreach ($this->facetRegistry->getFacets($context->backendUser) as $facet) {
            foreach ($facet->getTokenKeys() as $key) {
                $facetByKey[$key] ??= $facet;
            }
        }

        $uidSets = [];
        $seen = [];
        foreach ($tokens as $token) {
            // A literally repeated token ("doktype:1 doktype:1") resolves to
            // the same set, and ANDing a set with itself is a no-op - skip the
            // duplicate query instead.
            if (isset($seen[$token->raw])) {
                continue;
            }
            $seen[$token->raw] = true;
            if ($token->isFreetext()) {
                $uidSets[] = $this->queryHelper->getMatchingPageUids($token->firstValue(), $context);
                continue;
            }
            if ('site' === $token->key || 'under' === $token->key) {
                continue; // scope, not a criterion - handled separately
            }
            $facet = $facetByKey[$token->key] ?? null;
            if (null === $facet) {
                continue; // unknown token (e.g. uninstalled provider) -> ignored, never an error
            }
            $uidSets[] = $facet->resolvePageUids($token, $context);
        }

        return $uidSets;
    }

    /**
     * @param list<Token> $tokens
     */
    private function extractPageScope(array $tokens): ?int
    {
        foreach ($tokens as $token) {
            if ('under' === $token->key) {
                $uid = (int) $token->firstValue();

                return $uid > 0 ? $uid : null;
            }
        }

        return null;
    }
}
