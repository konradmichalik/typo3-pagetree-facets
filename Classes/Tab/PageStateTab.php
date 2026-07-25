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

final class PageStateTab extends AbstractPagesQueryTab
{
    public function getIdentifier(): string
    {
        return 'state';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:pagetree_lens/Resources/Private/Language/locallang.xlf:tab.state';
    }

    public function getGroup(): ?string
    {
        return 'state';
    }

    public function getTokenKeys(): array
    {
        return ['is'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $sets = [];
        foreach ($token->values as $state) {
            $sets[] = match ($state) {
                'empty' => $this->resolveEmpty($context),
                'restricted' => $this->resolveRestricted($context),
                'hidden' => $this->resolveFlag($context, 'hidden'),
                'timed' => $this->resolveTimed($context),
                'editlocked' => $this->resolveFlag($context, 'editlock'),
                default => null, // unknown state value -> ignored
            };
        }
        $sets = array_values(array_filter($sets, static fn (?array $set): bool => null !== $set));
        if ([] === $sets) {
            return [];
        }

        // Values within one token are OR-combined.
        return array_values(array_unique(array_merge(...$sets)));
    }

    public function getModalConfiguration(FilterContext $context): array
    {
        $lll = 'LLL:EXT:pagetree_lens/Resources/Private/Language/locallang.xlf:state.';

        return [
            'fields' => [
                [
                    'type' => 'checkbox-group',
                    'name' => 'is',
                    'label' => $this->getLabel(),
                    // Page state has no TCA icon source - manually mapped core
                    // icons. Activity presets deliberately get none (no natural
                    // symbol; avoid decoration).
                    'options' => [
                        ['value' => 'empty', 'label' => $lll.'empty', 'icon' => 'actions-file'],
                        ['value' => 'restricted', 'label' => $lll.'restricted', 'icon' => 'status-status-locked'],
                        ['value' => 'hidden', 'label' => $lll.'hidden', 'icon' => 'actions-eye-slash'],
                        ['value' => 'timed', 'label' => $lll.'timed', 'icon' => 'actions-clock'],
                        ['value' => 'editlocked', 'label' => $lll.'editlocked', 'icon' => 'actions-lock'],
                    ],
                ],
            ],
        ];
    }

    /**
     * Pages without any tt_content record (deleted=0; hidden COUNTS as
     * content - a page with five disabled elements is not empty). Restricted
     * to content-bearing doktypes so shortcuts/folders do not flood results.
     *
     * @return list<int>
     */
    private function resolveEmpty(FilterContext $context): array
    {
        $nonEmpty = array_flip($this->queryHelper->getPageUidsWithRecords('tt_content', $context));

        $candidates = $this->fetchPageUids($context, function ($queryBuilder): void {
            $this->excludeNonContentDoktypes($queryBuilder);
        });

        return array_values(array_filter($candidates, static fn (int $uid): bool => !isset($nonEmpty[$uid])));
    }

    /**
     * Direct fe_group / extendToSubpages on the page itself - inherited
     * restriction (recursive) is a documented v2 item.
     *
     * @return list<int>
     */
    private function resolveRestricted(FilterContext $context): array
    {
        return $this->fetchPageUids($context, static function ($queryBuilder): void {
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

    /**
     * @return list<int>
     */
    private function resolveFlag(FilterContext $context, string $field): array
    {
        return $this->fetchPageUids($context, static function ($queryBuilder) use ($field): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->eq($field, $queryBuilder->createNamedParameter(1, Connection::PARAM_INT)),
            );
        });
    }

    /**
     * @return list<int>
     */
    private function resolveTimed(FilterContext $context): array
    {
        return $this->fetchPageUids($context, static function ($queryBuilder): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->or(
                    $queryBuilder->expr()->gt('starttime', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                    $queryBuilder->expr()->gt('endtime', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                ),
            );
        });
    }
}
