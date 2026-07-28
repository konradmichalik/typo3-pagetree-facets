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

namespace KonradMichalik\PagetreeFacets\Service;

use TYPO3\CMS\Core\Exception\SiteNotFoundException;
use TYPO3\CMS\Core\Site\SiteFinder;

/**
 * SiteScopeService.
 *
 * "site:" is a scope, not a criterion: it produces no match set. Matched UIDs
 * are post-filtered by rootline against the site root page - cheap, because
 * result sets are small; never materialize the full site subtree.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class SiteScopeService
{
    public function __construct(
        private readonly SiteFinder $siteFinder,
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

        return array_values(array_filter($uids, function (int $uid) use ($rootPageId): bool {
            try {
                $site = $this->siteFinder->getSiteByPageId($uid);
            } catch (SiteNotFoundException) {
                return false;
            }

            return $site->getRootPageId() === $rootPageId;
        }));
    }
}
