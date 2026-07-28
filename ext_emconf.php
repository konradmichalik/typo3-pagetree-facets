<?php

/*
 * This file is part of the "pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

$EM_CONF[$_EXTKEY] = [
    'title' => 'Pagetree Facets',
    'description' => 'Filterable page tree with an extensible filter tab API, built on the TYPO3 v14 BeforePageTreeIsFilteredEvent.',
    'category' => 'be',
    'author' => 'Konrad Michalik',
    'author_email' => 'hej@konradmichalik.dev',
    'state' => 'beta',
    'version' => '0.1.0',
    'constraints' => [
        'depends' => [
            'php' => '8.3.0-8.5.99',
            'typo3' => '14.0.0-14.99.99',
        ],
        'conflicts' => [],
        'suggests' => [
            'seo' => '',
        ],
    ],
];
