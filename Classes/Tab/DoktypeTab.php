<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_lens" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeLens\Tab;

use KonradMichalik\PagetreeLens\Api\FilterContext;
use KonradMichalik\PagetreeLens\Token\Token;
use TYPO3\CMS\Core\Database\Connection;

final class DoktypeTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'doktype';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:pagetree_lens/Resources/Private/Language/locallang.xlf:tab.doktype';
    }

    public function getGroup(): ?string
    {
        return 'content';
    }

    public function getTokenKeys(): array
    {
        return ['doktype'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $doktypes = array_values(array_filter(array_map(intval(...), $token->values)));
        if ([] === $doktypes) {
            return [];
        }

        return $this->fetchPageUids($context, static function ($queryBuilder) use ($doktypes): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->in('doktype', $queryBuilder->createNamedParameter($doktypes, Connection::PARAM_INT_ARRAY)),
            );
        });
    }

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
