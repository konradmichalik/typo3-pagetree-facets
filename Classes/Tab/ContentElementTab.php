<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_lens" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeLens\Tab;

use KonradMichalik\PagetreeLens\Api\FilterContext;
use KonradMichalik\PagetreeLens\Token\Token;
use TYPO3\CMS\Core\Database\Connection;

/**
 * Pages containing content elements of a given CType. Plugins are regular
 * CTypes in v14, so a single token key suffices (no list_type legacy).
 */
final class ContentElementTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'ce';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:pagetree_lens/Resources/Private/Language/locallang.xlf:tab.ce';
    }

    public function getGroup(): ?string
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
            (string) $queryBuilder->expr()->in('CType', ':lensCtypes'),
            ['lensCtypes' => $token->values],
            ['lensCtypes' => Connection::PARAM_STR_ARRAY],
        );
    }

    public function getModalConfiguration(FilterContext $context): array
    {
        $options = [];
        // CType choices from TCA items incl. icons/labels (the "new content
        // element" wizard set) - custom CTypes appear automatically.
        foreach ($GLOBALS['TCA']['tt_content']['columns']['CType']['config']['items'] ?? [] as $item) {
            $value = (string) ($item['value'] ?? '');
            if ('' === $value || str_starts_with($value, '--')) {
                continue;
            }
            $options[] = [
                'value' => $value,
                'label' => (string) ($item['label'] ?? $value),
                'icon' => (string) ($item['icon'] ?? ''),
            ];
        }

        return [
            'fields' => [
                ['type' => 'checkbox-group', 'name' => 'ce', 'label' => $this->getLabel(), 'options' => $options],
            ],
        ];
    }
}
