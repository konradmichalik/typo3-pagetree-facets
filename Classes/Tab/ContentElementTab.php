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
        $buckets = array_fill_keys(array_keys($itemGroups), []);
        foreach ($config['items'] ?? [] as $item) {
            $value = (string) ($item['value'] ?? '');
            if ('' === $value || str_starts_with($value, '--')) {
                continue;
            }
            if (!$this->isCTypeAllowed($value, $context)) {
                continue;
            }
            // An item without a group lands in "default" rather than in the
            // core wizard's unlabeled bucket - every option carrying a real
            // group is what keeps the modal's headings contiguous.
            $group = (string) ($item['group'] ?? '');
            if ('' === $group) {
                $group = 'default';
            }
            $buckets[$group][] = [
                'value' => $value,
                'label' => (string) ($item['label'] ?? $value),
                'icon' => (string) ($item['icon'] ?? ''),
                'group' => $group,
            ];
        }

        // Groups keep the itemGroups order; a group used by an item but missing
        // from itemGroups falls back to its own identifier as the heading, same
        // as the core wizard does.
        $options = [];
        $groups = [];
        foreach ($buckets as $group => $groupOptions) {
            if ([] === $groupOptions) {
                continue;
            }
            $groups[$group] = $itemGroups[$group] ?? $group;
            array_push($options, ...$groupOptions);
        }

        return [
            'fields' => [
                [
                    'type' => 'checkbox-group',
                    'name' => 'ce',
                    'label' => $this->getLabel(),
                    'options' => $options,
                    'groups' => $groups,
                ],
            ],
        ];
    }

    /**
     * CType carries authMode "explicitAllow" in the core TCA, so a non-admin
     * only ever sees the element types their groups grant - offering a facet for
     * a type the user cannot work with is noise. Mirrors the core's own
     * AbstractItemProvider::removeItemsByUserAuthMode(), including its guard
     * clause for installations that drop the authMode.
     */
    private function isCTypeAllowed(string $value, FilterContext $context): bool
    {
        if (!is_string($GLOBALS['TCA']['tt_content']['columns']['CType']['config']['authMode'] ?? null)) {
            return true;
        }

        return $context->backendUser->checkAuthMode('tt_content', 'CType', $value);
    }
}
