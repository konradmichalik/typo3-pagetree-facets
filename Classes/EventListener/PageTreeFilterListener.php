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

namespace KonradMichalik\PagetreeFacets\EventListener;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\{ContentQueryHelper, FacetRegistry, MatchedPageRegistry, PageSubtreeScopeService, SiteScopeService};
use KonradMichalik\PagetreeFacets\Token\{Token, TokenParser};
use TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\Query\Expression\CompositeExpression;

/**
 * PageTreeFilterListener.
 *
 * The filter engine: parses the tree search phrase, resolves each keyed token
 * through its owning facet, intersects the UID sets (AND semantics) and feeds
 * the result into the core event.
 *
 * Verified against TYPO3 v14 (cms-backend 14.3): the core dispatches
 * BeforePageTreeIsFilteredEvent with an empty OR CompositeExpression as
 * $searchParts and combines the listener output as
 * `WHERE base AND ($searchParts OR uid IN ($searchUids))` (see
 * {@see \TYPO3\CMS\Backend\Tree\Repository\PageTreeRepository::getNodeRecords()}).
 * We therefore run AFTER the core's own listeners (they mutate $searchParts
 * and $searchUids during the same dispatch), overwrite $searchUids with our
 * intersection result and neutralize the core LIKE parts in $searchParts.
 *
 * The intersection is also handed to MatchedPageRegistry, which is what lets
 * SearchResultLabelListener mark the hits once the same request renders the
 * tree - the core surrounds them with their rootline, and by then the raw
 * search phrase is all that is left of this dispatch.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(
    identifier: 'pagetree-facets/filter',
    after: 'page-tree-wildcard-alias-filter',
)]
final readonly class PageTreeFilterListener
{
    /**
     * Impossible page UID used to force an empty result set when the
     * intersection is empty (uid 0 is the root, never a tree node).
     */
    private const int NO_MATCH_UID = 0;

    public function __construct(
        private TokenParser $tokenParser,
        private FacetRegistry $facetRegistry,
        private SiteScopeService $siteScopeService,
        private PageSubtreeScopeService $pageSubtreeScopeService,
        private ContentQueryHelper $queryHelper,
        private MatchedPageRegistry $matchedPages,
    ) {}

    public function __invoke(BeforePageTreeIsFilteredEvent $event): void
    {
        $backendUser = $this->getBackendUser();
        if (null === $backendUser || $this->facetRegistry->isDisabledForUser($backendUser)) {
            return;
        }

        $tokens = $this->tokenParser->parse($this->getSearchPhrase($event));
        if (!$this->tokenParser->hasKeyedTokens($tokens)) {
            // Freetext only -> core title/uid search stays untouched.
            return;
        }

        $context = new FilterContext(
            backendUser: $backendUser,
            workspaceId: $backendUser->workspace,
            siteIdentifier: $this->extractSiteScope($tokens),
        );

        $uidSets = $this->resolveUidSets($tokens, $context, $backendUser);
        if ([] === $uidSets) {
            return; // only unknown/scope tokens -> behave like core
        }

        $uids = $this->intersect($uidSets);

        // Site scope: post-filter the (small) result set instead of
        // materializing the site subtree upfront.
        if (null !== $context->siteIdentifier && [] !== $uids) {
            $uids = $this->siteScopeService->filterUidsBySite($uids, $context->siteIdentifier);
        }

        // Page scope ("under:<uid>", set from the modal's "current page and
        // its subpages" toggle): same treatment, post-filter by rootline
        // rather than materializing the scope page's subtree upfront.
        $pageScope = $this->extractPageScope($tokens);
        if (null !== $pageScope && [] !== $uids) {
            $uids = $this->pageSubtreeScopeService->filterUidsUnderPage($uids, $pageScope);
        }

        // Hand the hit list to the rendering phase before the no-match
        // substitution below turns it into something the tree can query but
        // nobody should see marked. SearchResultLabelListener picks it up from
        // there to tell hits apart from the rootline rendered around them.
        $this->matchedPages->record($uids);

        $this->applyResult($event, [] === $uids ? [self::NO_MATCH_UID] : $uids);
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
    private function resolveUidSets(array $tokens, FilterContext $context, BackendUserAuthentication $backendUser): array
    {
        // Resolve the (per-user config-filtered) facet set once for the whole
        // phrase and index it by token key, instead of re-running getFacets() via
        // findFacetForToken() for every token. First-seen wins, mirroring the
        // priority order findFacetForToken() would return.
        $facetByKey = [];
        foreach ($this->facetRegistry->getFacets($backendUser) as $facet) {
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
    private function extractSiteScope(array $tokens): ?string
    {
        foreach ($tokens as $token) {
            if ('site' === $token->key) {
                return $token->firstValue();
            }
        }

        return null;
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

    // --- Adapter around the core event (single place for core-API coupling) ---

    private function getSearchPhrase(BeforePageTreeIsFilteredEvent $event): string
    {
        return $event->searchPhrase;
    }

    /**
     * @param list<int> $uids
     */
    private function applyResult(BeforePageTreeIsFilteredEvent $event, array $uids): void
    {
        // Overwrite rather than merge: we run after the core listeners, so
        // $searchUids may already carry UIDs the core extracted from the raw
        // phrase (e.g. "doktype:1,42" -> numeric 42). Our intersection defines
        // the complete result set, including its own freetext/uid semantics via
        // ContentQueryHelper::getMatchingPageUids(). Merging would OR those
        // stray UIDs back in and, worse, defeat the forced no-match ([0]).
        $event->searchUids = array_values(array_unique($uids));

        // Neutralize the core LIKE parts: the core combines
        // `$searchParts OR uid IN ($searchUids)`, and $searchParts was built
        // against the FULL phrase including token syntax ("doktype:1 solar").
        // Replacing it with a constant-false OR term leaves the effective
        // filter as `uid IN ($searchUids)` - exactly our result set.
        $event->searchParts = CompositeExpression::or('1=0');
    }

    private function getBackendUser(): ?BackendUserAuthentication
    {
        return $GLOBALS['BE_USER'] ?? null;
    }
}
