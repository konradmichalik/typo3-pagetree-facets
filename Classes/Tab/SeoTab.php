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
use KonradMichalik\PagetreeFacets\Service\{ContentQueryHelper, OptionRegistry};
use KonradMichalik\PagetreeFacets\Token\Token;

/**
 * SeoTab.
 *
 * Container for the "seo:" vocabulary (SEO checks on EXT:seo fields). Like
 * PageStateTab, every value is a registered FilterOption resolved through the
 * OptionRegistry - the built-in noindex/nofollow/missing-description values
 * register in BuiltInOptionsListener, guarded by the same EXT:seo check that
 * gates this tab. Only registered when EXT:seo is installed (see
 * BuiltInTabsListener) - a built-in demonstration of conditional registration.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class SeoTab extends AbstractPagesQueryTab
{
    use SupportsFilterOptions;

    public function __construct(
        ContentQueryHelper $queryHelper,
        private readonly OptionRegistry $optionRegistry,
    ) {
        parent::__construct($queryHelper);
    }

    public function getIdentifier(): string
    {
        return 'seo';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.seo';
    }

    public function getGroup(): string
    {
        return 'quality';
    }

    public function getTokenKeys(): array
    {
        return ['seo'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        return $this->resolveViaOptions($token, $context);
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        return $this->appendOptions([
            'fields' => [
                [
                    'type' => 'checkbox-group',
                    'name' => 'seo',
                    'label' => $this->getLabel(),
                    'options' => [],
                ],
            ],
        ], 'seo', $context);
    }

    protected function optionRegistry(): OptionRegistry
    {
        return $this->optionRegistry;
    }
}
