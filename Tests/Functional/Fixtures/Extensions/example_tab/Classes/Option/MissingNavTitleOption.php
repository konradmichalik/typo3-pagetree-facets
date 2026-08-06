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

namespace KonradMichalik\PagetreeFacetsExampleTab\Option;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Option\AbstractPagesQueryOption;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

/**
 * MissingNavTitleOption.
 *
 * "is:no-nav-title" - a third-party value added to a **built-in** tab.
 *
 * This is the other half of the extension API, and the more common one: rather
 * than contributing a whole tab, an extension adds a single criterion to a token
 * key that already exists. Here the value joins Page state's "is" group, so it
 * appears as one more checkbox among "empty", "hidden" and the rest, and combines
 * with them exactly like a built-in - values of one token are OR-combined,
 * separate tokens AND-intersected.
 *
 * Extending AbstractPagesQueryOption is optional but saves the query plumbing:
 * fetchPageUids() hands over a workspace- and permission-aware QueryBuilder on
 * `pages`, and getIcon()/getDescription() already default to null, so an option
 * without either stays valid. Implementing FilterOptionInterface directly is
 * equally supported - do that when the criterion is not a pages-table query.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class MissingNavTitleOption extends AbstractPagesQueryOption
{
    /**
     * The existing key this value joins. "is" is Page state's - see PageStateTab.
     */
    public function getTokenKey(): string
    {
        return 'is';
    }

    /**
     * Together with the key this forms "is:no-nav-title", the stable identifier an
     * administrator disables the option under. Treat it as public API: renaming it
     * silently invalidates existing favorites and disableOptions settings.
     */
    public function getValue(): string
    {
        return 'no-nav-title';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:example_tab/Resources/Private/Language/locallang.xlf:option.noNavTitle';
    }

    public function getIcon(): string
    {
        return 'actions-tag';
    }

    public function getDescription(): string
    {
        return 'LLL:EXT:example_tab/Resources/Private/Language/locallang.xlf:option.noNavTitle.description';
    }

    /**
     * @return list<int>
     */
    public function resolvePageUids(FilterContext $context): array
    {
        return $this->fetchPageUids($context, function (QueryBuilder $queryBuilder): void {
            // Folders and shortcuts carry no navigation title by design, so counting
            // them would drown the pages the question is actually about.
            $this->excludeNonContentDoktypes($queryBuilder);
            $queryBuilder->andWhere(
                $queryBuilder->expr()->or(
                    $queryBuilder->expr()->isNull('nav_title'),
                    $queryBuilder->expr()->eq('nav_title', $queryBuilder->createNamedParameter('')),
                ),
            );
        });
    }
}
