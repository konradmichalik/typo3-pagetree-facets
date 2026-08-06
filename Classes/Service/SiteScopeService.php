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

use TYPO3\CMS\Core\Exception\SiteNotFoundException;
use TYPO3\CMS\Core\Site\SiteFinder;

/**
 * SiteScopeService.
 *
 * "site:" is a scope, not a criterion: it produces no match set. Matched UIDs
 * are post-filtered by ancestry against the site root page - never materialize
 * the full site subtree. A page belongs to the site whose root is the NEAREST
 * site root in its ancestor chain (same semantics as SiteFinder's
 * getSiteByPageId, which matters for sites nested inside another site's tree),
 * but resolved via one batched pid-map lookup ({@see PageAncestryService})
 * instead of a per-page rootline query.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class SiteScopeService
{
    public function __construct(
        private SiteFinder $siteFinder,
        private PageAncestryService $ancestry,
    ) {}

    /**
     * @param list<int> $uids
     *
     * @return list<int>
     */
    public function filterUidsBySite(array $uids, string $siteIdentifier): array
    {
        try {
            $rootPageId = $this->siteFinder->getSiteByIdentifier($siteIdentifier)->getRootPageId();
        } catch (SiteNotFoundException) {
            return $uids; // unknown site token -> ignored, never an error
        }

        if ([] === $uids) {
            return [];
        }

        $siteRoots = [];
        foreach ($this->siteFinder->getAllSites() as $site) {
            $siteRoots[$site->getRootPageId()] = true;
        }

        $pidMap = $this->ancestry->buildPidMap($uids);

        return array_values(array_filter($uids, static function (int $uid) use ($pidMap, $siteRoots, $rootPageId): bool {
            // First site root up the chain decides the page's site; pages
            // whose chain hits no site root at all (unknown or deleted uids)
            // are dropped. The depth guard only breaks pid cycles in corrupt
            // data - real trees end at 0.
            $depth = 0;
            for ($current = $uid; $current > 0 && $depth++ < 999; $current = $pidMap[$current] ?? 0) {
                if (isset($siteRoots[$current])) {
                    return $current === $rootPageId;
                }
            }

            return false;
        }));
    }
}
