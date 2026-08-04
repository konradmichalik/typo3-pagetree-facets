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

namespace KonradMichalik\PagetreeFacetsExampleTab\Tab;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Tab\AbstractPagesQueryTab;
use KonradMichalik\PagetreeFacets\Token\Token;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

/**
 * ExampleTab.
 *
 * Reference implementation of the third-party FilterTabInterface extension
 * point, filtering pages by whether their teaser text (pages.abstract) is set.
 * Registered the same way any real third-party tab would be - through
 * RegisterFilterTabsEvent, no special-casing (see ExampleTabListener).
 *
 * Copy this extension as a starting point. The three pieces you need are:
 *
 *  1. a FilterTabInterface implementation (this class),
 *  2. an #[AsEventListener] on RegisterFilterTabsEvent (ExampleTabListener),
 *  3. autowiring for both in Configuration/Services.yaml.
 *
 * Extending AbstractPagesQueryTab is optional but saves work whenever your
 * criterion is a condition on the "pages" table: it supplies fetchPageUids(),
 * excludeNonContentDoktypes() and a default serialize()/hydrate() pair. Tabs
 * that query elsewhere (or keep richer state) implement FilterTabInterface
 * directly and override serialize()/hydrate() themselves.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class ExampleTab extends AbstractPagesQueryTab
{
    /**
     * Stable, unique key for this tab. Used in the modal markup and as the name
     * administrators disable the tab under, via the "disabledTabs" extension
     * setting or "tx_pagetreefacets.disableTabs" in User TSconfig - so treat it
     * as public API and do not rename it casually.
     */
    public function getIdentifier(): string
    {
        return 'example';
    }

    /**
     * Shown on the tab in the modal navigation and prefixed to every active
     * filter chip this tab produces ("Teaser text: Set"). Returned untranslated:
     * FacetsModalController resolves LLL references on the way out, so pick a
     * label that still reads correctly in front of a value.
     */
    public function getLabel(): string
    {
        return 'LLL:EXT:example_tab/Resources/Private/Language/locallang.xlf:tab.example';
    }

    /**
     * Groups tabs under a heading in the modal navigation. Reusing a built-in
     * group ("content", "quality") sorts this tab into it; a new name, like the
     * "custom" one here, gets its own heading. Tabs are bucketed in priority
     * order, so a group's position follows its highest-priority member.
     */
    public function getGroup(): string
    {
        return 'custom';
    }

    /**
     * The token keys this tab owns, i.e. the "abstract" in "abstract:empty".
     * The engine routes a parsed token to whichever registered tab claims its
     * key, so keys must not collide with another tab's. A key nobody claims is
     * silently ignored rather than treated as a parse error - which is also why
     * disabling a tab reliably disables its tokens.
     */
    public function getTokenKeys(): array
    {
        return ['abstract'];
    }

    /**
     * Resolve one token to the page UIDs it matches. The engine intersects
     * (AND) the results of all tokens in the phrase, so return everything that
     * matches this criterion alone and do not worry about the others.
     *
     * Values inside a single token are alternatives ("abstract:set,empty"), so
     * they are OR-combined here. Returning an empty list means "no page
     * matches", which - being intersected - empties the whole result; that is
     * the correct answer for a token whose values are all unrecognised.
     */
    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $sets = [];
        foreach ($token->values as $value) {
            $sets[] = match ($value) {
                'set' => $this->resolveAbstract($context, isSet: true),
                'empty' => $this->resolveAbstract($context, isSet: false),
                default => null,
            };
        }
        $sets = array_values(array_filter($sets, static fn (?array $set): bool => null !== $set));

        return [] === $sets ? [] : array_values(array_unique(array_merge(...$sets)));
    }

    /**
     * Describe the tab's modal UI declaratively - no templates, no JavaScript.
     * The modal renders this schema generically, which is what keeps a
     * third-party tab visually identical to a built-in one.
     *
     * Field types available: checkbox-group, radio-presets, select,
     * record-search, text and user-picker. A field's "name" is its key in the
     * serialize()/hydrate() state array; several fields may share one name when
     * they are facets of a single criterion (the content element tab does this
     * to get one fieldset per wizard group). Option "description" becomes
     * screen-reader help text and never leaks into the chip label.
     *
     * Called on every modal open, so keep it cheap - and note it receives the
     * FilterContext too: options may legitimately depend on the current user's
     * permissions or the active site scope.
     *
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        $lll = 'LLL:EXT:example_tab/Resources/Private/Language/locallang.xlf:example.';

        return [
            'fields' => [
                [
                    'type' => 'checkbox-group',
                    'name' => 'abstract',
                    'label' => $this->getLabel(),
                    'options' => [
                        ['value' => 'set', 'label' => $lll.'set', 'description' => $lll.'set.description'],
                        ['value' => 'empty', 'label' => $lll.'empty', 'description' => $lll.'empty.description'],
                    ],
                ],
            ],
        ];
    }

    /**
     * fetchPageUids() comes from AbstractPagesQueryTab: it hands you a
     * QueryBuilder on "pages" that is already workspace-aware and restricted to
     * the sites the current user may see, then returns the matching UIDs. Add
     * your own constraints in the callback and leave the rest alone.
     *
     * @return list<int>
     */
    private function resolveAbstract(FilterContext $context, bool $isSet): array
    {
        return $this->fetchPageUids($context, static function (QueryBuilder $queryBuilder) use ($isSet): void {
            if ($isSet) {
                $queryBuilder->andWhere(
                    $queryBuilder->expr()->isNotNull('abstract'),
                    $queryBuilder->expr()->neq('abstract', $queryBuilder->createNamedParameter('')),
                );
            } else {
                $queryBuilder->andWhere(
                    $queryBuilder->expr()->or(
                        $queryBuilder->expr()->isNull('abstract'),
                        $queryBuilder->expr()->eq('abstract', $queryBuilder->createNamedParameter('')),
                    ),
                );
            }
        });
    }
}
