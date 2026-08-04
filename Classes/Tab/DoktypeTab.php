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
use KonradMichalik\PagetreeFacets\Token\Token;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

/**
 * DoktypeTab.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class DoktypeTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'doktype';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.doktype';
    }

    public function getGroup(): string
    {
        return 'content';
    }

    public function getTokenKeys(): array
    {
        return ['doktype'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $doktypes = array_values(array_filter(array_map(intval(...), $token->values), static fn (int $v): bool => 0 !== $v));
        if ([] === $doktypes) {
            return [];
        }

        return $this->fetchPageUids($context, static function (QueryBuilder $queryBuilder) use ($doktypes): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->in('doktype', $queryBuilder->createNamedParameter($doktypes, Connection::PARAM_INT_ARRAY)),
            );
        });
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        $options = [];
        // Labels AND icons from TCA - custom doktypes from sitepackages appear
        // automatically with their own icons; never hardcode.
        $iconClasses = $GLOBALS['TCA']['pages']['ctrl']['typeicon_classes'] ?? [];
        foreach ($GLOBALS['TCA']['pages']['columns']['doktype']['config']['items'] ?? [] as $item) {
            $value = (string) ($item['value'] ?? '');
            if ('' === $value || str_starts_with($value, '--')) {
                continue;
            }
            // pages.doktype carries no authMode; page types are gated by the
            // "pagetypes_select" group permission instead - the same list the
            // core's page tree and doktype select field honour. Offering a facet
            // for a page type the user cannot work with is noise.
            if (!$context->backendUser->check('pagetypes_select', $value)) {
                continue;
            }
            $options[] = [
                'value' => $value,
                'label' => (string) ($item['label'] ?? $value),
                'icon' => (string) ($item['icon'] ?? ($iconClasses[$value] ?? $iconClasses['default'] ?? '')),
            ];
        }

        return [
            'fields' => [
                [
                    'type' => 'checkbox-group',
                    'name' => 'doktype',
                    'label' => $this->getLabel(),
                    'options' => $options,
                ],
            ],
        ];
    }
}
