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

use KonradMichalik\PagetreeFacets\Event\RegisterFilterOptionsEvent;
use KonradMichalik\PagetreeFacetsExampleTab\Option\MissingNavTitleOption;
use TYPO3\CMS\Core\Attribute\AsEventListener;

/**
 * ExampleOptionListener.
 *
 * Registers a single option into an existing tab, through the same public event
 * the built-in options use (see BuiltInOptionsListener) - the sibling of
 * ExampleTabListener, and the whole registration: one #[AsEventListener] with a
 * unique identifier and one addOption() call. Nothing goes into
 * ext_localconf.php; the attribute is picked up as long as the class is autowired
 * in Configuration/Services.yaml.
 *
 * Priority 0 - the default, which places the option after every built-in value in
 * its checkbox group. Options sort by priority descending within their group,
 * registration order breaking ties, so passing a higher number would put this
 * value above "empty" and the rest. Built-ins occupy 100..20; sitting below them
 * is the polite default for a third party, and this shows what that looks like.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(identifier: 'pagetree-facets-example-tab/register-option')]
final readonly class ExampleOptionListener
{
    public function __construct(
        private MissingNavTitleOption $missingNavTitleOption,
    ) {}

    public function __invoke(RegisterFilterOptionsEvent $event): void
    {
        $event->addOption($this->missingNavTitleOption);
    }
}
