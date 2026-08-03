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
 * Demonstrates the third-party FilterTabInterface extension point: filters
 * pages by whether their teaser text (pages.abstract) is set. Registered the
 * same way any real third-party tab would be - through RegisterFilterTabsEvent,
 * no special-casing (see ExampleTabListener).
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class ExampleTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'example';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:example_tab/Resources/Private/Language/locallang.xlf:tab.example';
    }

    public function getGroup(): string
    {
        return 'custom';
    }

    public function getTokenKeys(): array
    {
        return ['abstract'];
    }

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
