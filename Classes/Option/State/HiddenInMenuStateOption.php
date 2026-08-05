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

/**
 * HiddenInMenuStateOption.
 *
 * "is:hidden-in-menu" - the page is visible but left out of navigation menus
 * (nav_hide). Its own state, separate from is:hidden.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class HiddenInMenuStateOption extends AbstractPagesQueryOption
{
    public function getTokenKey(): string
    {
        return 'is';
    }

    public function getValue(): string
    {
        return 'hidden-in-menu';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.hiddenInMenu';
    }

    public function getIcon(): string
    {
        return 'actions-list';
    }

    public function getDescription(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.hiddenInMenu.description';
    }

    public function resolvePageUids(FilterContext $context): array
    {
        return $this->resolveFlag($context, 'nav_hide');
    }
}
