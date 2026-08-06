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
 * PageSubtreeScopeService.
 *
 * "under:" is a scope, not a criterion, same treatment as "site:" (see
 * {@see SiteScopeService}): it produces no match set of its own. Matched UIDs
 * are post-filtered by ancestry against the scope page - never materialize
 * the full subtree of the scope page. The ancestor chains for the whole set
 * come from one batched pid-map lookup ({@see PageAncestryService}), so the
 * query count scales with tree depth, not with the number of matches.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class PageSubtreeScopeService
{
    public function __construct(
        private PageAncestryService $ancestry,
    ) {}

    /**
     * @param list<int> $uids
     *
     * @return list<int>
     */
    public function filterUidsUnderPage(array $uids, int $rootPageUid): array
    {
        if ([] === $uids) {
            return [];
        }

        $pidMap = $this->ancestry->buildPidMap($uids);

        return array_values(array_filter($uids, static function (int $uid) use ($pidMap, $rootPageUid): bool {
            // The chain starts at the page itself, so the scope page matches
            // too, not just descendants. A uid missing from the map (unknown
            // or deleted) ends the walk at 0 and is dropped. The depth guard
            // only breaks pid cycles in corrupt data - real trees end at 0.
            $depth = 0;
            for ($current = $uid; $current > 0 && $depth++ < 999; $current = $pidMap[$current] ?? 0) {
                if ($current === $rootPageUid) {
                    return true;
                }
            }

            return false;
        }));
    }
}
