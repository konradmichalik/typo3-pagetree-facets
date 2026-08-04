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

use TYPO3\CMS\Backend\Utility\BackendUtility;

/**
 * PageSubtreeScopeService.
 *
 * "under:" is a scope, not a criterion, same treatment as "site:" (see
 * {@see SiteScopeService}): it produces no match set of its own. Matched UIDs
 * are post-filtered by rootline against the scope page - cheap, because
 * result sets are small; never materialize the full subtree of the scope page.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PageSubtreeScopeService
{
    /**
     * @param list<int> $uids
     *
     * @return list<int>
     */
    public function filterUidsUnderPage(array $uids, int $rootPageUid): array
    {
        return array_values(array_filter($uids, static function (int $uid) use ($rootPageUid): bool {
            // BEgetRootLine() includes the page itself as the first entry, so
            // this also matches the scope page itself, not just descendants.
            foreach (BackendUtility::BEgetRootLine($uid) as $page) {
                if ((int) $page['uid'] === $rootPageUid) {
                    return true;
                }
            }

            return false;
        }));
    }
}
