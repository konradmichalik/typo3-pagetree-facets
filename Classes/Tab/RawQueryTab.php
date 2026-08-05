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
use KonradMichalik\PagetreeFacets\Token\Token;

/**
 * RawQueryTab.
 *
 * Power-user escape hatch (raw:) for field=value conditions against ANY TCA
 * table the current backend user has "tables_select" access to - the one
 * arbitrary-field-matching case RecordsTab deliberately does not cover (see
 * its docblock). Opt-in only: not registered unless the "enableRawQueryTab"
 * extension setting is on (BuiltInTabsListener).
 *
 * Syntax: "raw:<table>|<field>=<value>|<field2>=<value2>...". A value with a
 * leading/trailing '*' is LIKE-matched. Field names not present in the
 * table's TCA columns are silently dropped - never interpolated into SQL as
 * anything other than a whitelisted identifier.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RawQueryTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'raw';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.raw';
    }

    public function getGroup(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:group.advanced';
    }

    public function getTokenKeys(): array
    {
        return ['raw'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $parsed = $this->parseExpression($token->firstValue());
        if (null === $parsed) {
            return [];
        }
        [$table, $conditions] = $parsed;
        if (!$this->isAllowedTable($table, $context)) {
            return [];
        }
        if ([] !== $conditions) {
            $conditions = $this->onlyKnownColumns($table, $conditions);
            if ([] === $conditions) {
                return [];
            }
        }

        return $this->queryHelper->getPageUidsWithFieldMatch($table, $conditions, $context);
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        $lll = 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:raw.';

        return [
            'fields' => [
                ['type' => 'text', 'name' => 'raw', 'label' => $lll.'expression', 'placeholder' => $lll.'expression.placeholder', 'options' => []],
            ],
        ];
    }

    /**
     * @return array{0: string, 1: array<string, string>}|null
     */
    private function parseExpression(string $expression): ?array
    {
        $segments = array_values(array_filter(
            array_map(trim(...), explode('|', $expression)),
            static fn (string $segment): bool => '' !== $segment,
        ));
        if ([] === $segments) {
            return null;
        }
        $table = array_shift($segments);

        $conditions = [];
        foreach ($segments as $segment) {
            $eq = strpos($segment, '=');
            if (false === $eq || 0 === $eq) {
                continue;
            }
            $conditions[substr($segment, 0, $eq)] = substr($segment, $eq + 1);
        }

        // Field segments were given but none were valid "field=value" pairs -
        // do not fall through to "any record of table", that would silently
        // widen a typo'd condition into an unfiltered match.
        if ([] !== $segments && [] === $conditions) {
            return null;
        }

        return [$table, $conditions];
    }

    /**
     * @param array<string, string> $conditions
     *
     * @return array<string, string>
     */
    private function onlyKnownColumns(string $table, array $conditions): array
    {
        $columns = array_keys($GLOBALS['TCA'][$table]['columns'] ?? []);

        return array_intersect_key($conditions, array_flip($columns));
    }

    private function isAllowedTable(string $table, FilterContext $context): bool
    {
        return isset($GLOBALS['TCA'][$table])
            && $context->backendUser->check('tables_select', $table);
    }
}
