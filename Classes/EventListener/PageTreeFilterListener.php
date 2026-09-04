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

use KonradMichalik\PagetreeFacets\Service\TreeFilterResolver;
use TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Database\Query\Expression\CompositeExpression;

/**
 * PageTreeFilterListener.
 *
 * The v14 adapter between the core's tree-filter event and TreeFilterResolver,
 * which owns the decision logic (permission gate, parse, resolve, hand-over to
 * the render phase). This class's own job is nothing but the translation into
 * the core event's shape - the v13 middleware is the second implementation of
 * exactly that job against a different core API.
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
 * The event does not exist before v14, which is what the whole
 * Compatibility\V13 namespace is about.
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
        private TreeFilterResolver $treeFilterResolver,
    ) {}

    public function __invoke(BeforePageTreeIsFilteredEvent $event): void
    {
        $uids = $this->treeFilterResolver->resolve($this->getSearchPhrase($event));
        if (null === $uids) {
            return;
        }

        $this->applyResult($event, [] === $uids ? [self::NO_MATCH_UID] : $uids);
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
}
