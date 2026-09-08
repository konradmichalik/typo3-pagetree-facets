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

/**
 * MatchedPageRegistry.
 *
 * Carries the filter's hit list from the query phase to the rendering phase of
 * one tree request: TreeFilterResolver::resolve() fills it - via either core
 * adapter, PageTreeFilterListener handling BeforePageTreeIsFilteredEvent on
 * v14 or PageTreeFilterMiddleware rewriting the request on v13 - and
 * SearchResultLabelListener reads it while handling
 * AfterPageTreeItemsPreparedEvent. Whichever adapter ran and the label listener
 * are dispatched by the same TreeController request but share no payload, and
 * the label listener only receives the raw search phrase - which is why the
 * set has to be handed over rather than derived again (re-resolving it would
 * mean running every tab's query a second time).
 *
 * The core solves the identical problem with the runtime cache (see
 * PageTreeFilter's translation/URI match caches); a dedicated service keeps the
 * set typed and the hand-over explicit in both constructors.
 *
 * Deliberately mutable and deliberately not readonly: this is request-scoped
 * state, and DI hands the same instance to both listeners.
 *
 * "Active" is the distinction the label listener depends on and is not the same
 * as "has hits": a facet filter that matched nothing is still a facet filter,
 * while a plain title search or an unfiltered fetch must leave the tree alone.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class MatchedPageRegistry
{
    /**
     * Flipped for O(1) lookups - the label listener asks once per rendered node,
     * and broad criteria resolve to five-figure UID sets.
     *
     * @var array<int, true>
     */
    private array $matched = [];

    private bool $active = false;

    /**
     * Called once per request, from TreeFilterResolver::resolve() on either
     * adapter, while the hit list is derived from the phrase alone and comes
     * out the same every time. Adding to the lookup rather than replacing it
     * is simply what that shape asks for.
     *
     * @param list<int> $uids
     */
    public function record(array $uids): void
    {
        $this->active = true;
        foreach ($uids as $uid) {
            $this->matched[$uid] = true;
        }
    }

    public function isActive(): bool
    {
        return $this->active;
    }

    public function matches(int $uid): bool
    {
        return isset($this->matched[$uid]);
    }
}
