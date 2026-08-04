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

namespace KonradMichalik\PagetreeFacets\Tab;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Token\Token;
use TYPO3\CMS\Core\Database\Connection;

use function is_string;

/**
 * ContentElementTab.
 *
 * Pages containing content elements of a given CType. Plugins are regular
 * CTypes in v14, so a single token key suffices (no list_type legacy).
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class ContentElementTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'ce';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:pagetree_facets/Resources/Private/Language/locallang.xlf:tab.ce';
    }

    public function getGroup(): string
    {
        return 'content';
    }

    public function getTokenKeys(): array
    {
        return ['ce'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $queryBuilder = $this->queryHelper->createQueryBuilder('tt_content', $context);

        return $this->queryHelper->getPageUidsWithRecords(
            'tt_content',
            $context,
            $queryBuilder->expr()->in('CType', ':facetsCtypes'),
            ['facetsCtypes' => $token->values],
            ['facetsCtypes' => Connection::PARAM_STR_ARRAY],
        );
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        $config = $GLOBALS['TCA']['tt_content']['columns']['CType']['config'] ?? [];
        /** @var array<string, string> $itemGroups */
        $itemGroups = $config['itemGroups'] ?? [];

        // CType choices from TCA items incl. icons/labels (the "new content
        // element" wizard set) - custom CTypes appear automatically. Options are
        // bucketed by their TCA "group", the same source NewContentElementController
        // groups the wizard by, so both stay in sync by construction.
        // CType carries authMode "explicitAllow" in the core TCA, so a non-admin
        // only ever sees the element types their groups grant - offering a facet
        // for a type the user cannot work with is noise. The guard mirrors the
        // core's AbstractItemProvider::removeItemsByUserAuthMode() for
        // installations that drop the authMode.
        $checkAuthMode = is_string($config['authMode'] ?? null);

        $buckets = array_fill_keys(array_keys($itemGroups), []);
        foreach ($config['items'] ?? [] as $item) {
            $value = (string) ($item['value'] ?? '');
            if ('' === $value || str_starts_with($value, '--')) {
                continue;
            }
            if ($checkAuthMode && !$context->backendUser->checkAuthMode('tt_content', 'CType', $value)) {
                continue;
            }
            // An item without a group lands in "default" rather than in the
            // core wizard's unlabeled bucket - an unlabeled fieldset would have
            // no legend at all.
            $group = (string) ($item['group'] ?? '');
            if ('' === $group) {
                $group = 'default';
            }
            $buckets[$group][] = [
                'value' => $value,
                'label' => (string) ($item['label'] ?? $value),
                'icon' => (string) ($item['icon'] ?? ''),
            ];
        }

        // One field per group, each labelled with its group - the same shape the
        // Activity tab uses for its two presets, so the generic renderer turns
        // the labels into fieldset legends. All fields share the "ce" name, which
        // is what keeps this a single criterion for serialize()/hydrate() and for
        // the modal's value collection. Fields keep the itemGroups order; a group
        // used by an item but missing from itemGroups falls back to its own
        // identifier as the label, same as the core wizard does.
        $fields = [];
        foreach ($buckets as $group => $groupOptions) {
            if ([] === $groupOptions) {
                continue;
            }
            $fields[] = [
                'type' => 'checkbox-group',
                'name' => 'ce',
                'label' => $itemGroups[$group] ?? $group,
                'options' => $groupOptions,
            ];
        }

        return ['fields' => $fields];
    }
}
