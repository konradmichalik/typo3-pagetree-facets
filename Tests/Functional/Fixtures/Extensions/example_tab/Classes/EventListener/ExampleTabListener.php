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
 * No priority argument, so it defaults to 0 - which places the tab after every
 * built-in (they occupy 100 down to 40, plus 10 for the opt-in raw tab), and with
 * it the "custom" group heading at the bottom of the navigation. That is the
 * polite default for a third party and what this example should show. Tabs sort by
 * priority descending with registration order breaking ties, so passing a number
 * above 100 would push the tab in front of the built-ins - possible, and
 * occasionally right, but not something to demonstrate as the norm. See
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
        $event->addTab($this->exampleTab);
    }
}
