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

use KonradMichalik\PagetreeLens\Controller\LensModalController;

return [
    'pagetree_lens_configuration' => [
        'path' => '/pagetree-lens/configuration',
        'target' => LensModalController::class.'::configuration',
    ],
    'pagetree_lens_serialize' => [
        'path' => '/pagetree-lens/serialize',
        'target' => LensModalController::class.'::serialize',
    ],
    'pagetree_lens_favorite_add' => [
        'path' => '/pagetree-lens/favorite/add',
        'target' => LensModalController::class.'::addFavorite',
    ],
    'pagetree_lens_favorite_remove' => [
        'path' => '/pagetree-lens/favorite/remove',
        'target' => LensModalController::class.'::removeFavorite',
    ],
];
