<?php

/*
 * This file is part of the "demo_content" fixture extension, used only for
 * local development of "pagetree_facets" (seeds page-tree data for the
 * interactive DDEV instance). Not part of the shipped package.
 */

$EM_CONF[$_EXTKEY] = [
    'title' => 'Pagetree Facets - Demo Content (dev fixture)',
    'description' => 'Local-only console command seeding a richer page tree for testing pagetree_facets.',
    'category' => 'misc',
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
        'suggests' => [],
    ],
];
