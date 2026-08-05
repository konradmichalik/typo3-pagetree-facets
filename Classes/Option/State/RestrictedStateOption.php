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
 * RestrictedStateOption.
 *
 * "is:restricted" - direct fe_group / extendToSubpages on the page itself.
 * Inherited restriction (recursive) is a documented v2 item.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RestrictedStateOption extends AbstractPagesQueryOption
{
    public function getTokenKey(): string
    {
        return 'is';
    }

    public function getValue(): string
    {
        return 'restricted';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.restricted';
    }

    public function getIcon(): string
    {
        return 'overlay-locked';
    }

    public function getDescription(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.restricted.description';
    }

    public function resolvePageUids(FilterContext $context): array
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
}
