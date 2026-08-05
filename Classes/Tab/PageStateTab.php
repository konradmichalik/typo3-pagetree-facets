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
 * PageStateTab.
 *
 * Container for the "is:" vocabulary. Every value - the six built-ins
 * (empty, hidden, restricted, ...) and any third-party additions - is a
 * registered FilterOption resolved through the OptionRegistry; the tab itself
 * only owns the token key, the modal field and the default serialize/hydrate
 * from AbstractPagesQueryTab. See BuiltInOptionsListener for the built-ins.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PageStateTab extends AbstractPagesQueryTab
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
        return 'state';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.state';
    }

    public function getGroup(): string
    {
        return 'state';
    }

    public function getTokenKeys(): array
    {
        return ['is'];
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
                    'name' => 'is',
                    'label' => $this->getLabel(),
                    'options' => [],
                ],
            ],
        ], 'is', $context);
    }

    protected function optionRegistry(): OptionRegistry
    {
        return $this->optionRegistry;
    }
}
