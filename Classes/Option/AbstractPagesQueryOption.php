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

namespace KonradMichalik\PagetreeFacets\Option;

use KonradMichalik\PagetreeFacets\Api\{FilterContext, FilterOptionInterface};
use KonradMichalik\PagetreeFacets\Service\ContentQueryHelper;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

/**
 * AbstractPagesQueryOption.
 *
 * Base for options whose criterion is a condition on the pages table itself -
 * the option-side counterpart of AbstractPagesQueryTab. Icon and description
 * default to none; concrete options override what they need.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
abstract class AbstractPagesQueryOption implements FilterOptionInterface
{
    public function __construct(
        protected readonly ContentQueryHelper $queryHelper,
    ) {}

    public function getIcon(): ?string
    {
        return null;
    }

    public function getDescription(): ?string
    {
        return null;
    }

    /**
     * @return list<int>
     */
    final protected function fetchPageUids(FilterContext $context, callable $constrain): array
    {
        $queryBuilder = $this->queryHelper->createQueryBuilder('pages', $context);
        $queryBuilder->select('uid')->from('pages');
        $constrain($queryBuilder);

        return array_map(intval(...), $queryBuilder->executeQuery()->fetchFirstColumn());
    }

    /**
     * Pages where a boolean pages flag is set. Does not exclude non-content
     * doktypes - a hidden or edit-locked folder is a legitimate match.
     *
     * @return list<int>
     */
    final protected function resolveFlag(FilterContext $context, string $field): array
    {
        return $this->fetchPageUids($context, static function (QueryBuilder $queryBuilder) use ($field): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->eq($field, $queryBuilder->createNamedParameter(1, Connection::PARAM_INT)),
            );
        });
    }

    final protected function excludeNonContentDoktypes(QueryBuilder $queryBuilder): void
    {
        $queryBuilder->andWhere(
            $queryBuilder->expr()->notIn(
                'doktype',
                $queryBuilder->createNamedParameter(ContentQueryHelper::NON_CONTENT_DOKTYPES, Connection::PARAM_INT_ARRAY),
            ),
        );
    }
}
