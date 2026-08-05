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

namespace KonradMichalik\PagetreeFacets\Option\Seo;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Option\AbstractPagesQueryOption;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

/**
 * MissingDescriptionOption.
 *
 * "seo:missing-description" - indexable pages (no_index=0) whose meta
 * description is empty. Restricted to content-bearing doktypes. Only
 * registered when EXT:seo is installed.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class MissingDescriptionOption extends AbstractPagesQueryOption
{
    public function getTokenKey(): string
    {
        return 'seo';
    }

    public function getValue(): string
    {
        return 'missing-description';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:seo.missingDescription';
    }

    public function getIcon(): string
    {
        return 'actions-exclamation-triangle';
    }

    public function resolvePageUids(FilterContext $context): array
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
