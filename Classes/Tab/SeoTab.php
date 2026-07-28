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
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

/**
 * SeoTab.
 *
 * SEO checks on fields provided by EXT:seo. This tab is only registered when
 * EXT:seo is installed (see BuiltInTabsListener) - a built-in demonstration
 * of conditional registration through the public tab API. Restricted to
 * content-bearing doktypes so folders/shortcuts do not flood the results.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class SeoTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'seo';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:pagetree_facets/Resources/Private/Language/locallang.xlf:tab.seo';
    }

    public function getGroup(): string
    {
        return 'quality';
    }

    public function getTokenKeys(): array
    {
        return ['seo'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $sets = [];
        foreach ($token->values as $check) {
            $sets[] = match ($check) {
                'noindex' => $this->resolveFlag('no_index', $context),
                'nofollow' => $this->resolveFlag('no_follow', $context),
                'missing-description' => $this->resolveMissingDescription($context),
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
        $lll = 'LLL:EXT:pagetree_facets/Resources/Private/Language/locallang.xlf:seo.';

        return [
            'fields' => [
                [
                    'type' => 'checkbox-group',
                    'name' => 'seo',
                    'label' => $this->getLabel(),
                    'options' => [
                        ['value' => 'noindex', 'label' => $lll.'noindex', 'icon' => 'actions-eye-slash'],
                        ['value' => 'nofollow', 'label' => $lll.'nofollow', 'icon' => 'actions-link-slash'],
                        ['value' => 'missing-description', 'label' => $lll.'missingDescription', 'icon' => 'actions-exclamation-triangle'],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return list<int>
     */
    private function resolveFlag(string $field, FilterContext $context): array
    {
        return $this->fetchPageUids($context, function (QueryBuilder $queryBuilder) use ($field): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->eq($field, $queryBuilder->createNamedParameter(1, Connection::PARAM_INT)),
            );
            $this->excludeNonContentDoktypes($queryBuilder);
        });
    }

    /**
     * @return list<int>
     */
    private function resolveMissingDescription(FilterContext $context): array
    {
        return $this->fetchPageUids($context, function (QueryBuilder $queryBuilder): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->or(
                    $queryBuilder->expr()->isNull('description'),
                    $queryBuilder->expr()->eq('description', $queryBuilder->createNamedParameter('')),
                ),
                $queryBuilder->expr()->eq('no_index', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
            );
            $this->excludeNonContentDoktypes($queryBuilder);
        });
    }
}
