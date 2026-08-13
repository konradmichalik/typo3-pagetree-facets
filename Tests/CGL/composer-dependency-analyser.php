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

use Composer\Autoload;
use ShipMonk\ComposerDependencyAnalyser;
use ShipMonk\ComposerDependencyAnalyser\Config\ErrorType;

$rootPath = dirname(__DIR__, 2);

/** @var Autoload\ClassLoader $loader */
$loader = require $rootPath.'/vendor/autoload.php';
$loader->register();

$configuration = new ComposerDependencyAnalyser\Config\Configuration();
$configuration
    ->addPathToScan($rootPath.'/Configuration', false)
    ->addPathsToExclude([
        $rootPath.'/Tests/CGL',
        $rootPath.'/Tests/Functional/Fixtures',
    ])
    // typo3/cms-form is a deliberate dev-only dependency (see composer.json):
    // Classes/Tab/FormTab.php references FormPersistenceManagerInterface only
    // via ::class inside GeneralUtility::makeInstance(), never as a real
    // type-hint, so it's never autoloaded unless EXT:form is genuinely
    // present. The analyser can't tell a ::class-only reference from a real
    // compile-time dependency, so this specific false positive is ignored.
    ->ignoreErrorsOnPackage('typo3/cms-form', [ErrorType::DEV_DEPENDENCY_IN_PROD])
;

return $configuration;
