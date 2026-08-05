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

namespace KonradMichalik\PagetreeFacets\Api;

/**
 * FilterOptionInterface.
 *
 * A single value contributed to the vocabulary of an existing token key, e.g.
 * "broken-links" under the "is" key of the page-state tab. An option owns one
 * (tokenKey, value) pair, describes its checkbox entry, and resolves the value
 * to a set of page UIDs - exactly the two halves of a checkbox in a vocabulary
 * tab, but pluggable.
 *
 * Options register through RegisterFilterOptionsEvent the same way tabs
 * register through RegisterFilterTabsEvent. The built-in page-state and SEO
 * values dogfood this event too - there is no private shortcut, matching how
 * FilterTabInterface is handled.
 *
 * Only vocabulary tabs (a checkbox-group whose values map to a match) surface
 * options; TCA-derived tabs (doktype, records, ...) build their options
 * dynamically and ignore this event.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
interface FilterOptionInterface
{
    /**
     * The existing token key this option extends, e.g. "is" or "seo".
     *
     * @return non-empty-string
     */
    public function getTokenKey(): string;

    /**
     * The option's value, e.g. "broken-links". The pair
     * getTokenKey().":".getValue() is the stable identifier administrators
     * disable it under (ext conf "disabledOptions" / User TSconfig
     * "tx_typo3pagetreefacets.disableOptions"), so treat it as public API.
     *
     * @return non-empty-string
     */
    public function getValue(): string;

    /**
     * LLL reference or plain label for the checkbox. Resolved server-side
     * through LanguageService::sL() like every other modal label.
     */
    public function getLabel(): string;

    /**
     * IconRegistry identifier rendered via <typo3-backend-icon>, or null.
     */
    public function getIcon(): ?string;

    /**
     * Optional help text (tooltip + screen-reader description), or null.
     */
    public function getDescription(): ?string;

    /**
     * Resolve this option's value to the set of matching page UIDs. Values of
     * one token are OR-combined by the owning tab; separate tokens are
     * AND-intersected by the engine.
     *
     * @return list<int>
     */
    public function resolvePageUids(FilterContext $context): array;
}
