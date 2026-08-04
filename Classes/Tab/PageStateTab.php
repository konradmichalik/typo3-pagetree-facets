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
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

/**
 * PageStateTab.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PageStateTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'state';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.state';
    }

    public function getGroup(): string
    {
        return 'state';
    }

    public function getTokenKeys(): array
    {
        return ['is'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $sets = [];
        foreach ($token->values as $state) {
            $sets[] = match ($state) {
                'empty' => $this->resolveEmpty($context),
                'restricted' => $this->resolveRestricted($context),
                'hidden' => $this->resolveFlag($context, 'hidden'),
                'hidden-in-menu' => $this->resolveFlag($context, 'nav_hide'),
                'timed' => $this->resolveTimed($context),
                'editlocked' => $this->resolveFlag($context, 'editlock'),
                default => null, // unknown state value -> ignored
            };
        }
        $sets = array_values(array_filter($sets, static fn (?array $set): bool => null !== $set));
        if ([] === $sets) {
            return [];
        }

        // Values within one token are OR-combined.
        return array_values(array_unique(array_merge(...$sets)));
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        $lll = 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.';

        return [
            'fields' => [
                [
                    'type' => 'checkbox-group',
                    'name' => 'is',
                    'label' => $this->getLabel(),
                    // Page state has no TCA icon source - manually mapped core
                    // icons. Activity presets deliberately get none (no natural
                    // symbol; avoid decoration).
                    'options' => [
                        ['value' => 'empty', 'label' => $lll.'empty', 'icon' => 'actions-file', 'description' => $lll.'empty.description'],
                        ['value' => 'restricted', 'label' => $lll.'restricted', 'icon' => 'overlay-locked', 'description' => $lll.'restricted.description'],
                        ['value' => 'hidden', 'label' => $lll.'hidden', 'icon' => 'overlay-hidden'],
                        ['value' => 'hidden-in-menu', 'label' => $lll.'hiddenInMenu', 'icon' => 'actions-list', 'description' => $lll.'hiddenInMenu.description'],
                        ['value' => 'timed', 'label' => $lll.'timed', 'icon' => 'actions-clock', 'description' => $lll.'timed.description'],
                        ['value' => 'editlocked', 'label' => $lll.'editlocked', 'icon' => 'actions-lock', 'description' => $lll.'editlocked.description'],
                    ],
                ],
            ],
        ];
    }

    /**
     * Pages without any tt_content record (deleted=0; hidden COUNTS as
     * content - a page with five disabled elements is not empty). Restricted
     * to content-bearing doktypes so shortcuts/folders do not flood results.
     *
     * Pages with content_from_pid are excluded: they own no records but render
     * another page's content, so reporting them would be a false positive for
     * the question this filter answers - "where is content still missing?".
     *
     * @return list<int>
     */
    private function resolveEmpty(FilterContext $context): array
    {
        $nonEmpty = array_flip($this->queryHelper->getPageUidsWithRecords('tt_content', $context));

        $candidates = $this->fetchPageUids($context, function (QueryBuilder $queryBuilder): void {
            $this->excludeNonContentDoktypes($queryBuilder);
            $queryBuilder->andWhere(
                $queryBuilder->expr()->or(
                    $queryBuilder->expr()->isNull('content_from_pid'),
                    $queryBuilder->expr()->eq('content_from_pid', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                ),
            );
        });

        return array_values(array_filter($candidates, static fn (int $uid): bool => !isset($nonEmpty[$uid])));
    }

    /**
     * Direct fe_group / extendToSubpages on the page itself - inherited
     * restriction (recursive) is a documented v2 item.
     *
     * @return list<int>
     */
    private function resolveRestricted(FilterContext $context): array
    {
        return $this->fetchPageUids($context, static function (QueryBuilder $queryBuilder): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->or(
                    $queryBuilder->expr()->and(
                        $queryBuilder->expr()->isNotNull('fe_group'),
                        $queryBuilder->expr()->neq('fe_group', $queryBuilder->createNamedParameter('')),
                        $queryBuilder->expr()->neq('fe_group', $queryBuilder->createNamedParameter('0')),
                    ),
                    $queryBuilder->expr()->eq('extendToSubpages', $queryBuilder->createNamedParameter(1, Connection::PARAM_INT)),
                ),
            );
        });
    }

    /**
     * @return list<int>
     */
    private function resolveFlag(FilterContext $context, string $field): array
    {
        return $this->fetchPageUids($context, static function (QueryBuilder $queryBuilder) use ($field): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->eq($field, $queryBuilder->createNamedParameter(1, Connection::PARAM_INT)),
            );
        });
    }

    /**
     * @return list<int>
     */
    private function resolveTimed(FilterContext $context): array
    {
        return $this->fetchPageUids($context, static function (QueryBuilder $queryBuilder): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->or(
                    $queryBuilder->expr()->gt('starttime', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                    $queryBuilder->expr()->gt('endtime', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                ),
            );
        });
    }
}
