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

namespace KonradMichalik\PagetreeFacetsExampleTab\EventListener;

use KonradMichalik\PagetreeFacets\Event\RegisterFilterTabsEvent;
use KonradMichalik\PagetreeFacetsExampleTab\Tab\ExampleTab;
use TYPO3\CMS\Core\Attribute\AsEventListener;

/**
 * ExampleTabListener.
 *
 * Registers the example tab through the exact same public event a real
 * third-party extension would use - no private shortcut, matching how the
 * main extension's own built-in tabs register themselves.
 *
 * Priority 110 - deliberately above Records' 100 (the highest built-in) so
 * this tab, and its own "custom" group, render first. Demonstrates that
 * third-party tabs are not stuck at the default priority 0 / bottom of the
 * list; see RegisterFilterTabsEvent's docblock for the priority convention.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(identifier: 'pagetree-facets-example-tab/register')]
final class ExampleTabListener
{
    public function __construct(
        private readonly ExampleTab $exampleTab,
    ) {}

    public function __invoke(RegisterFilterTabsEvent $event): void
    {
        $event->addTab($this->exampleTab, 110);
    }
}
