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

namespace KonradMichalik\PagetreeFacets\Option\State;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Option\AbstractPagesQueryOption;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

/**
 * EmptyStateOption.
 *
 * "is:empty" - pages without any tt_content record (deleted=0; hidden COUNTS
 * as content, a page with five disabled elements is not empty). Restricted to
 * content-bearing doktypes so shortcuts/folders do not flood results. The
 * "no records" test is a NOT EXISTS anti-join, so only the final (small) set
 * is materialized - a fetch-both-sets-and-subtract approach would pull every
 * non-empty pid plus every candidate uid into PHP.
 *
 * Pages with content_from_pid are excluded: they own no records but render
 * another page's content, so reporting them would be a false positive for the
 * question this filter answers - "where is content still missing?".
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class EmptyStateOption extends AbstractPagesQueryOption
{
    public function getTokenKey(): string
    {
        return 'is';
    }

    public function getValue(): string
    {
        return 'empty';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.empty';
    }

    public function getIcon(): string
    {
        return 'actions-file';
    }

    public function getDescription(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.empty.description';
    }

    public function resolvePageUids(FilterContext $context): array
    {
        return $this->fetchPageUids($context, function (QueryBuilder $queryBuilder) use ($context): void {
            $this->excludeNonContentDoktypes($queryBuilder);
            $queryBuilder->andWhere(
                $queryBuilder->expr()->or(
                    $queryBuilder->expr()->isNull('content_from_pid'),
                    $queryBuilder->expr()->eq('content_from_pid', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                ),
                'NOT '.$this->queryHelper->createRecordsExistExpression('tt_content', 'pid', $context),
            );
        });
    }
}
