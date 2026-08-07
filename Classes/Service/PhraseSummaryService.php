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

namespace KonradMichalik\PagetreeFacets\Service;

use KonradMichalik\PagetreeFacets\Token\{Token, TokenParser};
use TYPO3\CMS\Backend\Utility\BackendUtility;
use TYPO3\CMS\Core\Localization\LanguageService;

use function count;

/**
 * PhraseSummaryService.
 *
 * Says what a token phrase filters for, in the words the modal itself uses -
 * "Page state: Hidden" rather than "is:hidden". Backs the favorites list, which
 * is the one place a phrase is read *before* it takes effect and where the raw
 * syntax the modal exists to hide would be exactly the wrong thing to show.
 *
 * It resolves against the tab configurations the controller has already built
 * for this request, so no tab is asked for its options a second time: the whole
 * pass is a token parse plus array lookups. The one exception is "under:<uid>",
 * where the page title is worth a (statically cached) record lookup - a bare uid
 * says nothing.
 *
 * Anything it cannot resolve keeps its raw token text: an unknown key, a tab the
 * user has disabled, or a value that is no longer offered (a language outside the
 * current site scope). That fallback is not a defeat - those are precisely the
 * parts that will not survive being loaded into the form, so showing them as
 * syntax is honest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class PhraseSummaryService
{
    public function __construct(
        private TokenParser $tokenParser,
    ) {}

    /**
     * Every favorite with its phrase described, ready for the modal.
     *
     * @param list<array{label: string, tokenString: string, createdAt: int}> $favorites
     * @param list<array<string, mixed>>                                      $tabs
     *
     * @return list<array<string, mixed>>
     */
    public function describeFavorites(array $favorites, array $tabs): array
    {
        foreach ($favorites as $index => $favorite) {
            $criteria = $this->describe($favorite['tokenString'], $tabs);
            // A favorite saved without a name keeps its phrase as the label (see
            // FavoriteService); the summary is the better stand-in now that we
            // have one - and repeating it below would say the same thing twice.
            if ($favorite['label'] === $favorite['tokenString'] && [] !== $criteria) {
                $favorites[$index]['label'] = implode(', ', $criteria);
                $criteria = [];
            }
            $favorites[$index]['criteria'] = $criteria;
        }

        return $favorites;
    }

    /**
     * @param list<array<string, mixed>> $tabs as built for the modal: identifier, label, translated `configuration.fields`
     *
     * @return list<string> one entry per criterion, in phrase order
     */
    public function describe(string $phrase, array $tabs): array
    {
        $criteria = [];
        foreach ($this->tokenParser->parse($phrase) as $token) {
            foreach ($this->describeToken($token, $tabs) as $criterion) {
                $criteria[] = $criterion;
            }
        }

        return $criteria;
    }

    /**
     * @param list<array<string, mixed>> $tabs
     *
     * @return list<string>
     */
    private function describeToken(Token $token, array $tabs): array
    {
        if ($token->isFreetext()) {
            return [$token->firstValue()];
        }
        if ('site' === $token->key) {
            return [$this->label('summary.site', 'Site').': '.$token->firstValue()];
        }
        if ('under' === $token->key) {
            return [$this->label('summary.under', 'Below').': '.$this->pageTitle($token->firstValue())];
        }

        $field = $this->findField($token->key, $tabs);
        if (null === $field) {
            return [$token->raw];
        }

        // One entry per value, the same way one selected option is one chip -
        // "doktype:1,4" is two criteria to the engine and reads as two here.
        $criteria = [];
        foreach ($token->values as $value) {
            $criteria[] = $field['prefix'].': '.$this->optionLabel($field['options'], $value);
        }

        return $criteria;
    }

    /**
     * The tab (and, where it adds anything, the field heading) a token key
     * belongs to. Field name and token key are the same string by convention -
     * where a tab breaks that convention its tokens stay unresolved rather than
     * being attributed to the wrong criterion.
     *
     * @param list<array<string, mixed>> $tabs
     *
     * @return array{prefix: string, options: list<array<string, mixed>>}|null
     */
    private function findField(string $key, array $tabs): ?array
    {
        foreach ($tabs as $tab) {
            $fields = (array) (($tab['configuration'] ?? [])['fields'] ?? []);
            $matching = array_values(array_filter(
                $fields,
                static fn (array $field): bool => $key === (string) ($field['name'] ?? ''),
            ));
            if ([] === $matching) {
                continue;
            }

            return [
                'prefix' => $this->prefix($tab, $fields, $matching),
                'options' => $this->mergeOptions($matching),
            ];
        }

        return null;
    }

    /**
     * Same rule as the active-filter chips: a name repeated across several
     * fields is bucketed (records by source, content elements by wizard group),
     * where the field label is a section heading rather than a criterion name -
     * those keep the tab label. Otherwise the field heading earns its place only
     * where a tab holds more than one criterion, and only when it is not just
     * the tab's own name again.
     *
     * @param array<string, mixed>       $tab
     * @param array<int, mixed>          $fields   every field of that tab
     * @param list<array<string, mixed>> $matching those carrying the token key
     */
    private function prefix(array $tab, array $fields, array $matching): string
    {
        $tabLabel = (string) ($tab['label'] ?? '');
        $fieldLabel = (string) ($matching[0]['label'] ?? '');
        $distinctNames = count(array_unique(array_map(
            static fn (array $field): string => (string) ($field['name'] ?? ''),
            $fields,
        )));

        return 1 === count($matching) && $distinctNames > 1 && '' !== $fieldLabel && $fieldLabel !== $tabLabel
            ? $fieldLabel
            : $tabLabel;
    }

    /**
     * A bucketed field's options belong to one criterion, so they are searched
     * as one list.
     *
     * @param list<array<string, mixed>> $matching
     *
     * @return list<array<string, mixed>>
     */
    private function mergeOptions(array $matching): array
    {
        $options = [];
        foreach ($matching as $field) {
            $options = [...$options, ...(array) ($field['options'] ?? [])];
        }

        return array_values($options);
    }

    /**
     * @param list<array<string, mixed>> $options
     */
    private function optionLabel(array $options, string $value): string
    {
        foreach ($options as $option) {
            if ($value === (string) ($option['value'] ?? '')) {
                return (string) ($option['label'] ?? $value);
            }
        }

        // Free-text criteria (a search term, a raw expression, a picked user)
        // carry no option list to look up - the value is its own label.
        return $value;
    }

    private function pageTitle(string $uid): string
    {
        $page = BackendUtility::getRecord('pages', (int) $uid, 'uid,title');
        $title = (string) ($page['title'] ?? '');

        // A deleted or inaccessible page leaves the uid, which is still more
        // useful than nothing when the favorite is opened.
        return '' !== $title ? $title : $uid;
    }

    private function label(string $key, string $fallback): string
    {
        $translated = $this->getLanguageService()->sL(
            'typo3_pagetree_facets.messages:pagetreeFacets.modal.'.$key,
        );

        return '' !== $translated ? $translated : $fallback;
    }

    private function getLanguageService(): LanguageService
    {
        return $GLOBALS['LANG'];
    }
}
