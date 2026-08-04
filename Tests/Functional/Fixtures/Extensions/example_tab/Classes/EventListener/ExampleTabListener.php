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
 * This is the whole registration: one #[AsEventListener] whose identifier only
 * has to be unique, and one addTab() call. There is nothing to add to
 * ext_localconf.php - the attribute is picked up automatically, as long as the
 * class is autowired in your Configuration/Services.yaml.
 *
 * Priority 110 - deliberately above Content elements' 100 (the highest
 * built-in) so this tab, and its own "custom" group, render first. Tabs sort by
 * priority descending, registration order breaking ties; omitting the argument
 * defaults to 0, which places a tab after every built-in. Nothing stops a
 * third party from positioning itself deliberately, as here. See
 * RegisterFilterTabsEvent's docblock for the priority convention.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(identifier: 'pagetree-facets-example-tab/register')]
final readonly class ExampleTabListener
{
    public function __construct(
        private ExampleTab $exampleTab,
    ) {}

    public function __invoke(RegisterFilterTabsEvent $event): void
    {
        $event->addTab($this->exampleTab, 110);
    }
}
