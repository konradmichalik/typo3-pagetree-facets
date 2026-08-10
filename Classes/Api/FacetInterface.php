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

use KonradMichalik\PagetreeFacets\Token\Token;

/**
 * FacetInterface.
 *
 * A filter facet: owns one or more token keys, resolves them to page UID sets
 * (engine side) and describes its modal UI declaratively (UI side).
 *
 * Built-in facets register through the same RegisterFacetsEvent as third
 * parties - there is no private shortcut.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
interface FacetInterface
{
    /**
     * Stable identifier, also used for User TSconfig disableFacets.
     */
    public function getIdentifier(): string;

    /**
     * LLL reference or plain label shown in the modal navigation.
     */
    public function getLabel(): string;

    /**
     * Optional group for the vertical modal navigation ("content", "state",
     * "quality", or an own section label for third parties). Null = ungrouped.
     * Resolved through the same LLL lookup as getLabel(), so an LLL: reference
     * works here too.
     */
    public function getGroup(): ?string;

    /**
     * Token keys this facet owns, e.g. ['doktype'] or ['table', 'record', 'text'].
     *
     * @return list<non-empty-string>
     */
    public function getTokenKeys(): array;

    /**
     * Resolve one token to the set of matching page UIDs.
     * Return values are intersected (AND) across all active tokens by the engine.
     *
     * @return list<int>
     */
    public function resolvePageUids(Token $token, FilterContext $context): array;

    /**
     * Declarative modal UI schema rendered by the generic modal JS.
     *
     * Shape:
     * [
     *   'fields' => [
     *     [
     *       'type' => 'checkbox-group'|'select'|'radio-presets'|'text'|'user-picker',
     *       'name' => string,                    // maps into serialize()/hydrate() state
     *       'label' => string,
     *       'options' => [                       // for choice types
     *         ['value' => string, 'label' => string, 'icon' => ?string, 'description' => ?string],
     *       ],                                   //   icon = IconRegistry identifier, rendered via
     *                                             //   <typo3-backend-icon>; description = optional
     *                                             //   help text (tooltip + screen-reader description)
     *                                             //   for when the label alone isn't enough
     *       'currentUser' => ['uid' => int, 'username' => string], // user-picker only: pins
     *                                             //   "Me" as a suggestion without a search round trip
     *       'pinned' => [                         // user-picker only: pseudo-values pinned above the
     *         ['value' => string, 'label' => string, 'icon' => ?string],
     *       ],                                   //   search results, next to "Me" - e.g. "Unassigned".
     *                                             //   Selected through the same dataset.value contract
     *                                             //   as a real user, so nothing else has to know they
     *                                             //   are not be_users records.
     *     ],
     *   ],
     * ]
     *
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array;

    /**
     * Modal state (field name => value(s)) to token(s).
     *
     * @param array<string, mixed> $modalState
     *
     * @return list<Token>
     */
    public function serialize(array $modalState): array;

    /**
     * Token(s) back to modal state. Must be the inverse of serialize() for
     * all states serialize() can produce. Unknown values are dropped silently.
     *
     * @param list<Token> $tokens
     *
     * @return array<string, mixed>
     */
    public function hydrate(array $tokens): array;
}
