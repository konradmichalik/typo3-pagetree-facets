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

return [
    'dependencies' => ['backend', 'core'],
    'imports' => [
        '@konradmichalik/pagetree-facets/' => 'EXT:pagetree_facets/Resources/Public/JavaScript/',
    ],
];
