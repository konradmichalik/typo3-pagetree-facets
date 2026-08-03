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

use KonradMichalik\PagetreeFacets\Controller\FacetsModalController;

return [
    'pagetree_facets_configuration' => [
        'path' => '/pagetree-facets/configuration',
        'target' => FacetsModalController::class.'::configuration',
    ],
    'pagetree_facets_serialize' => [
        'path' => '/pagetree-facets/serialize',
        'target' => FacetsModalController::class.'::serialize',
    ],
    'pagetree_facets_favorite_add' => [
        'path' => '/pagetree-facets/favorite/add',
        'target' => FacetsModalController::class.'::addFavorite',
    ],
    'pagetree_facets_favorite_remove' => [
        'path' => '/pagetree-facets/favorite/remove',
        'target' => FacetsModalController::class.'::removeFavorite',
    ],
    'pagetree_facets_users' => [
        'path' => '/pagetree-facets/users',
        'target' => FacetsModalController::class.'::users',
    ],
];
