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
 * EditlockedStateOption.
 *
 * "is:editlocked" - editing is locked for all non-admin backend users,
 * independent of their normal permissions.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class EditlockedStateOption extends AbstractPagesQueryOption
{
    public function getTokenKey(): string
    {
        return 'is';
    }

    public function getValue(): string
    {
        return 'editlocked';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.editlocked';
    }

    public function getIcon(): string
    {
        return 'actions-lock';
    }

    public function getDescription(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.editlocked.description';
    }

    public function resolvePageUids(FilterContext $context): array
    {
        return $this->resolveFlag($context, 'editlock');
    }
}
