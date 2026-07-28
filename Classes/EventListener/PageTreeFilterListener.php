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

namespace KonradMichalik\PagetreeFacets\EventListener;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\{ContentQueryHelper, SiteScopeService, TabRegistry};
use KonradMichalik\PagetreeFacets\Token\{Token, TokenParser};
use TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\Query\Expression\CompositeExpression;

/**
 * PageTreeFilterListener.
 *
 * The filter engine: parses the tree search phrase, resolves each keyed token
 * through its owning tab, intersects the UID sets (AND semantics) and feeds
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
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(
    identifier: 'pagetree-facets/filter',
    after: 'page-tree-wildcard-alias-filter',
)]
final class PageTreeFilterListener
{
    /**
     * Impossible page UID used to force an empty result set when the
     * intersection is empty (uid 0 is the root, never a tree node).
     */
    private const int NO_MATCH_UID = 0;

    public function __construct(
        private readonly TokenParser $tokenParser,
        private readonly TabRegistry $tabRegistry,
        private readonly SiteScopeService $siteScopeService,
        private readonly ContentQueryHelper $queryHelper,
    ) {}

    public function __invoke(BeforePageTreeIsFilteredEvent $event): void
    {
        $backendUser = $this->getBackendUser();
        if (null === $backendUser || $this->tabRegistry->isDisabledForUser($backendUser)) {
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

        $uids = array_shift($uidSets);
        foreach ($uidSets as $set) {
            $uids = array_values(array_intersect($uids, $set));
        }

        // Site scope: post-filter the (small) result set instead of
        // materializing the site subtree upfront.
        if (null !== $context->siteIdentifier && [] !== $uids) {
            $uids = $this->siteScopeService->filterUidsBySite($uids, $context->siteIdentifier);
        }

        $this->applyResult($event, [] === $uids ? [self::NO_MATCH_UID] : $uids);
    }

    /**
     * Resolve each keyed token to its page-UID set via the owning tab; freetext
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
        $uidSets = [];
        foreach ($tokens as $token) {
            if ($token->isFreetext()) {
                $uidSets[] = $this->queryHelper->getMatchingPageUids($token->firstValue(), $context);
                continue;
            }
            if ('site' === $token->key) {
                continue; // scope, not a criterion - handled separately
            }
            $tab = $this->tabRegistry->findTabForToken($token, $backendUser);
            if (null === $tab) {
                continue; // unknown token (e.g. uninstalled provider) -> ignored, never an error
            }
            $uidSets[] = $tab->resolvePageUids($token, $context);
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
