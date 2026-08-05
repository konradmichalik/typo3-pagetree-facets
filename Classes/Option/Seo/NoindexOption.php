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
 * NoindexOption.
 *
 * "seo:noindex" - the EXT:seo no_index flag is set. Restricted to
 * content-bearing doktypes so folders/shortcuts do not flood the results.
 * Only registered when EXT:seo is installed (see BuiltInOptionsListener).
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class NoindexOption extends AbstractPagesQueryOption
{
    public function getTokenKey(): string
    {
        return 'seo';
    }

    public function getValue(): string
    {
        return 'noindex';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:seo.noindex';
    }

    public function getIcon(): string
    {
        return 'overlay-hidden';
    }

    public function resolvePageUids(FilterContext $context): array
    {
        return $this->fetchPageUids($context, function (QueryBuilder $queryBuilder): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->eq('no_index', $queryBuilder->createNamedParameter(1, Connection::PARAM_INT)),
            );
            $this->excludeNonContentDoktypes($queryBuilder);
        });
    }
}
