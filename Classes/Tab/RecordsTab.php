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

/**
 * RecordsTab.
 *
 * Pages containing records of a table (table:), one concrete record
 * (record:<table>:<uid>) or records matching a text (text:"...").
 *
 * text: performs a LIKE search across the table's TCA ctrl.searchFields;
 * without a table: token in the same filter it targets tt_content
 * ("which page contains word X in its content"). Deliberate limits:
 * LIKE only, searchFields only - no arbitrary field=value matching.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RecordsTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'records';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:pagetree_facets/Resources/Private/Language/locallang.xlf:tab.records';
    }

    public function getGroup(): string
    {
        return 'content';
    }

    public function getTokenKeys(): array
    {
        return ['table', 'record', 'text'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        return match ($token->key) {
            'table' => $this->resolveTables($token->values, $context),
            'record' => $this->resolveRecord($token->firstValue(), $context),
            'text' => $this->resolveText($token->firstValue(), $context),
            default => [],
        };
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        $lll = 'LLL:EXT:pagetree_facets/Resources/Private/Language/locallang.xlf:records.';
        $options = [];
        foreach (array_keys($GLOBALS['TCA'] ?? []) as $tableKey) {
            $table = (string) $tableKey;
            if (!$this->isAllowedTable($table, $context) || true === ($GLOBALS['TCA'][$table]['ctrl']['hideTable'] ?? false)) {
                continue;
            }
            $options[] = [
                'value' => $table,
                'label' => (string) ($GLOBALS['TCA'][$table]['ctrl']['title'] ?? $table),
                // Table icons from TCA ctrl typeicon_classes.
                'icon' => (string) ($GLOBALS['TCA'][$table]['ctrl']['typeicon_classes']['default'] ?? ''),
            ];
        }

        return [
            'fields' => [
                ['type' => 'select', 'name' => 'table', 'label' => $lll.'table', 'options' => $options],
                ['type' => 'text', 'name' => 'text', 'label' => $lll.'text', 'options' => []],
            ],
        ];
    }

    /**
     * @param list<string> $tables
     *
     * @return list<int>
     */
    private function resolveTables(array $tables, FilterContext $context): array
    {
        $uids = [];
        foreach ($tables as $table) {
            if (!$this->isAllowedTable($table, $context)) {
                continue;
            }
            $uids[] = $this->queryHelper->getPageUidsWithRecords($table, $context);
        }

        return [] === $uids ? [] : array_values(array_unique(array_merge(...$uids)));
    }

    /**
     * @return list<int>
     */
    private function resolveRecord(string $value, FilterContext $context): array
    {
        $lastColon = strrpos($value, ':');
        if (false === $lastColon) {
            return [];
        }
        $table = substr($value, 0, $lastColon);
        $uid = (int) substr($value, $lastColon + 1);
        if ($uid <= 0 || !$this->isAllowedTable($table, $context)) {
            return [];
        }

        $queryBuilder = $this->queryHelper->createQueryBuilder($table, $context);

        return $this->queryHelper->getPageUidsWithRecords(
            $table,
            $context,
            $queryBuilder->expr()->eq('uid', ':facetsRecordUid'),
            ['facetsRecordUid' => $uid],
        );
    }

    /**
     * @return list<int>
     */
    private function resolveText(string $needle, FilterContext $context): array
    {
        // The engine resolves tokens independently; text: therefore searches
        // its default target (tt_content). Combined with table: tokens the
        // AND intersection narrows to pages that have BOTH the table records
        // and matching content. Restricting text: to the selected tables'
        // searchFields directly is an M3 refinement (needs token grouping in
        // the tab, not the engine).
        return $this->queryHelper->getPageUidsWithTextMatch('tt_content', $needle, $context);
    }

    private function isAllowedTable(string $table, FilterContext $context): bool
    {
        return isset($GLOBALS['TCA'][$table])
            && $context->backendUser->check('tables_select', $table);
    }
}
