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

use KonradMichalik\PagetreeFacets\Compatibility\V13\PageTreeFilterMiddleware;
use TYPO3\CMS\Core\Information\Typo3Version;

// The page tree filter runs through BeforePageTreeIsFilteredEvent from v14 on
// (see PageTreeFilterListener). v13 has no such event, so there the same job is
// done by a middleware that rewrites the filter request before it reaches
// TreeController. Registering both would be harmless but pointless - the second
// one to run would see a phrase without keyed tokens - so the version decides
// here, in the one place where the extension knows which core it is on.
if ((new Typo3Version())->getMajorVersion() >= 14) {
    return [];
}

return [
    'backend' => [
        'typo3-pagetree-facets/tree-filter' => [
            'target' => PageTreeFilterMiddleware::class,
            // Resolving criteria needs an authenticated backend user (page
            // permissions, workspace, User TSconfig), and the route attribute
            // this middleware matches on is set by backend-routing. Both are in
            // place once site-resolver has run, which is also the last core
            // middleware before the route is dispatched.
            'after' => [
                'typo3/cms-backend/site-resolver',
            ],
        ],
    ],
];
