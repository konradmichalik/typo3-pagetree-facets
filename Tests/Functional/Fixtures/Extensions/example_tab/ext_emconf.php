<?php

/*
 * This file is part of the "example_tab" fixture extension, used only for
 * local development of "pagetree_facets" (PHPUnit functional tests and the
 * interactive DDEV instance). Not part of the shipped package.
 */

$EM_CONF[$_EXTKEY] = [
    'title' => 'Pagetree Facets - Example Tab (dev fixture)',
    'description' => 'Local-only example third-party filter tab demonstrating the FilterTabInterface extension point.',
    'category' => 'be',
    'author' => 'Konrad Michalik',
    'author_email' => 'hej@konradmichalik.dev',
    'state' => 'beta',
    'version' => '0.1.0',
    'constraints' => [
        'depends' => [
            'php' => '8.3.0-8.5.99',
            'typo3' => '14.0.0-14.99.99',
            'pagetree_facets' => '0.1.0-0.1.99',
        ],
        'conflicts' => [],
        'suggests' => [],
    ],
];
