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
 * HiddenStateOption.
 *
 * "is:hidden" - the page's own hidden flag is set.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class HiddenStateOption extends AbstractPagesQueryOption
{
    public function getTokenKey(): string
    {
        return 'is';
    }

    public function getValue(): string
    {
        return 'hidden';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:state.hidden';
    }

    public function getIcon(): string
    {
        return 'overlay-hidden';
    }

    public function resolvePageUids(FilterContext $context): array
    {
        return $this->resolveFlag($context, 'hidden');
    }
}
