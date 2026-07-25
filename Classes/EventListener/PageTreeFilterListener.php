<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_lens" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeLens\EventListener;

use KonradMichalik\PagetreeLens\Api\FilterContext;
use KonradMichalik\PagetreeLens\Service\ContentQueryHelper;
use KonradMichalik\PagetreeLens\Service\SiteScopeService;
use KonradMichalik\PagetreeLens\Service\TabRegistry;
use KonradMichalik\PagetreeLens\Token\Token;
use KonradMichalik\PagetreeLens\Token\TokenParser;
use TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\Query\Expression\CompositeExpression;

/**
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
 */
#[AsEventListener(
    identifier: 'pagetree-lens/filter',
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
        if ($backendUser === null || $this->tabRegistry->isDisabledForUser($backendUser)) {
            return;
        }

        $tokens = $this->tokenParser->parse($this->getSearchPhrase($event));
        if (!$this->tokenParser->hasKeyedTokens($tokens)) {
            // Freetext only -> core title/uid search stays untouched.
            return;
        }

        $context = new FilterContext(
            backendUser: $backendUser,
            workspaceId: (int)$backendUser->workspace,
            siteIdentifier: $this->extractSiteScope($tokens),
        );

        $uidSets = [];
        foreach ($tokens as $token) {
            if ($token->isFreetext()) {
                // Freetext combined with tokens is resolved by US (pages
                // searchFields LIKE + numeric uid) and intersected like any
                // other criterion - relying on the core's searchParts here
                // would leave the combined semantics to an unverified
                // OR/AND behavior of the event consumer.
                $uidSets[] = $this->queryHelper->getMatchingPageUids($token->firstValue(), $context);
                continue;
            }
            if ($token->key === 'site') {
                continue; // scope, not a criterion - handled below
            }
            $tab = $this->tabRegistry->findTabForToken($token, $backendUser);
            if ($tab === null) {
                continue; // unknown token (e.g. uninstalled provider) -> ignored, never an error
            }
            $uidSets[] = $tab->resolvePageUids($token, $context);
        }

        if ($uidSets === []) {
            return; // only unknown/scope tokens -> behave like core
        }

        $uids = array_shift($uidSets);
        foreach ($uidSets as $set) {
            $uids = array_values(array_intersect($uids, $set));
        }

        // Site scope: post-filter the (small) result set instead of
        // materializing the site subtree upfront.
        if ($context->siteIdentifier !== null && $uids !== []) {
            $uids = $this->siteScopeService->filterUidsBySite($uids, $context->siteIdentifier);
        }

        $this->applyResult($event, $uids === [] ? [self::NO_MATCH_UID] : $uids);
    }

    /**
     * @param list<Token> $tokens
     */
    private function extractSiteScope(array $tokens): ?string
    {
        foreach ($tokens as $token) {
            if ($token->key === 'site') {
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
