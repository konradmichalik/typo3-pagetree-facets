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

use TYPO3\CMS\Core\Imaging\IconProvider\SvgIconProvider;

/*
 * The extension's own glyph, used as a brand mark in the filter modal header.
 * Kept separate from Resources/Public/Icons/Extension.svg: that one is the filled
 * tile the extension listing shows, while this is a monochrome currentColor glyph
 * that inherits its surroundings the way core's own icons do.
 */
return [
    'pagetree-facets' => [
        'provider' => SvgIconProvider::class,
        'source' => 'EXT:typo3_pagetree_facets/Resources/Public/Icons/pagetree-facets-icon.svg',
    ],
];
