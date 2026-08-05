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

namespace KonradMichalik\PagetreeFacets\Tab;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\ContentQueryHelper;
use KonradMichalik\PagetreeFacets\Token\Token;
use TYPO3\CMS\Core\Package\{PackageInterface, PackageManager};

use function in_array;
use function sprintf;
use function str_starts_with;
use function strlen;

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
    private const array CORE_TABLES = ['pages', 'tt_content'];
    private const array CORE_TABLE_PREFIXES = ['sys_', 'be_', 'fe_'];

    public function __construct(
        ContentQueryHelper $queryHelper,
        private readonly PackageManager $packageManager,
    ) {
        parent::__construct($queryHelper);
    }

    public function getIdentifier(): string
    {
        return 'records';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.records';
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
        $lll = 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:records.';
        $extensionBuckets = $this->extensionBuckets();

        $buckets = [];
        $bucketLabels = [];
        foreach (array_keys($GLOBALS['TCA'] ?? []) as $tableKey) {
            $table = (string) $tableKey;
            if (!$this->isAllowedTable($table, $context) || true === ($GLOBALS['TCA'][$table]['ctrl']['hideTable'] ?? false)) {
                continue;
            }
            $bucketKey = $this->bucketKeyForTable($table, $extensionBuckets);
            if (!isset($bucketLabels[$bucketKey])) {
                $bucketLabels[$bucketKey] = $this->bucketLabel($bucketKey, $extensionBuckets, $lll);
            }
            $buckets[$bucketKey][] = [
                'value' => $table,
                'label' => (string) ($GLOBALS['TCA'][$table]['ctrl']['title'] ?? $table),
                // Table icons from TCA ctrl typeicon_classes.
                'icon' => (string) ($GLOBALS['TCA'][$table]['ctrl']['typeicon_classes']['default'] ?? ''),
            ];
        }

        $tableFields = [];
        foreach ($buckets as $bucketKey => $options) {
            $tableFields[] = [
                'type' => 'checkbox-group',
                'name' => 'table',
                'label' => $bucketLabels[$bucketKey],
                'options' => $options,
            ];
        }

        return [
            'fields' => [
                ...$tableFields,
                ['type' => 'text', 'name' => 'text', 'label' => $lll.'text', 'placeholder' => $lll.'text.placeholder', 'options' => []],
            ],
        ];
    }

    /**
     * Active packages, pre-computed once per getModalConfiguration() call - not
     * cached across calls (deliberately, see the design spec: negligible cost).
     *
     * @return array<string, array{prefix: string, package: PackageInterface}>
     */
    private function extensionBuckets(): array
    {
        $buckets = [];
        foreach ($this->packageManager->getActivePackages() as $package) {
            $extensionKey = $package->getPackageKey();
            $buckets[$extensionKey] = [
                'prefix' => 'tx_'.str_replace('_', '', $extensionKey).'_',
                'package' => $package,
            ];
        }

        return $buckets;
    }

    /**
     * @param array<string, array{prefix: string, package: PackageInterface}> $extensionBuckets
     */
    private function bucketKeyForTable(string $table, array $extensionBuckets): string
    {
        if (in_array($table, self::CORE_TABLES, true)) {
            return 'core';
        }
        foreach (self::CORE_TABLE_PREFIXES as $corePrefix) {
            if (str_starts_with($table, $corePrefix)) {
                return 'core';
            }
        }

        $bestExtensionKey = null;
        $bestPrefixLength = 0;
        foreach ($extensionBuckets as $extensionKey => $bucket) {
            if (str_starts_with($table, $bucket['prefix']) && strlen($bucket['prefix']) > $bestPrefixLength) {
                $bestExtensionKey = $extensionKey;
                $bestPrefixLength = strlen($bucket['prefix']);
            }
        }

        return $bestExtensionKey ?? 'other';
    }

    /**
     * @param array<string, array{prefix: string, package: PackageInterface}> $extensionBuckets
     */
    private function bucketLabel(string $bucketKey, array $extensionBuckets, string $lll): string
    {
        return match ($bucketKey) {
            'core' => $lll.'group.core',
            'other' => $lll.'group.other',
            default => $this->extensionBucketLabel($bucketKey, $extensionBuckets[$bucketKey]['package'] ?? null),
        };
    }

    private function extensionBucketLabel(string $extensionKey, ?PackageInterface $package): string
    {
        $title = $package?->getPackageMetaData()->getTitle();

        return (null !== $title && '' !== $title) ? sprintf('%s (%s)', $title, $extensionKey) : $extensionKey;
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
