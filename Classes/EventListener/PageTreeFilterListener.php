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
use KonradMichalik\PagetreeFacets\Service\{FacetRegistry, FilterResolutionService, MatchedPageRegistry};
use KonradMichalik\PagetreeFacets\Token\{Token, TokenParser};
use TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\Query\Expression\CompositeExpression;

/**
 * PageTreeFilterListener.
 *
 * The adapter between the core's tree-filter event and FilterResolutionService,
 * which owns the actual resolve pipeline (AND intersection, site/page scope) -
 * the same service backs FacetsModalController::count() for the modal's live
 * match-count preview, so both paths run identical criteria resolution. This
 * class's own job: parse the search phrase, build the FilterContext, and
 * translate the resolved result into the core event's shape.
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
 * The resolved hit list is also handed to MatchedPageRegistry, which is what lets
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
        private FilterResolutionService $filterResolutionService,
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
            $backendUser,
            $backendUser->workspace,
            $this->extractSiteScope($tokens),
        );

        $uids = $this->filterResolutionService->resolve($tokens, $context);
        if (null === $uids) {
            return; // only unknown/scope tokens -> behave like core
        }

        // Hand the hit list to the rendering phase before the no-match
        // substitution below turns it into something the tree can query but
        // nobody should see marked. SearchResultLabelListener picks it up from
        // there to tell hits apart from the rootline rendered around them.
        $this->matchedPages->record($uids);

        $this->applyResult($event, [] === $uids ? [self::NO_MATCH_UID] : $uids);
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
