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
use TYPO3\CMS\Core\DataHandling\History\RecordHistoryStore;

/**
 * ActivityTab.
 *
 * Presets over the page's EFFECTIVE change date:
 * GREATEST(pages.tstamp, MAX(tt_content.tstamp)) - content changes count,
 * a page whose text was edited yesterday is "recently updated" even if the
 * page record itself was not touched. Deliberately NOT SYS_LASTCHANGED
 * (only written on FE rendering; unreliable for BE-only or migrated pages).
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class ActivityTab extends AbstractPagesQueryTab
{
    private const array PRESETS = ['<7d', '<30d', '<6m', '<1y', '>6m', '>1y'];

    public function getIdentifier(): string
    {
        return 'activity';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.activity';
    }

    public function getGroup(): string
    {
        return 'state';
    }

    public function getTokenKeys(): array
    {
        return ['updated', 'created', 'by', 'createdby'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        return match ($token->key) {
            'updated' => $this->resolveUpdated($token->firstValue(), $context),
            'created' => $this->resolveTimestampField('crdate', $token->firstValue(), $context),
            'by' => $this->resolveBy($token->firstValue(), $context, RecordHistoryStore::ACTION_MODIFY),
            'createdby' => $this->resolveBy($token->firstValue(), $context, RecordHistoryStore::ACTION_ADD),
            default => [],
        };
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        $lll = 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:activity.';
        $presetOptions = array_map(
            static fn (string $preset): array => ['value' => $preset, 'label' => $lll.'preset.'.ltrim($preset, '<>').'.'.$preset[0]],
            self::PRESETS,
        );

        $currentUser = [
            'uid' => (int) ($context->backendUser->user['uid'] ?? 0),
            'username' => (string) ($context->backendUser->user['username'] ?? ''),
        ];

        return [
            'fields' => [
                ['type' => 'radio-presets', 'name' => 'updated', 'label' => $lll.'updated', 'options' => $presetOptions],
                ['type' => 'radio-presets', 'name' => 'created', 'label' => $lll.'created', 'options' => $presetOptions],
                [
                    'type' => 'user-picker',
                    'name' => 'by',
                    'label' => $lll.'by',
                    'options' => [],
                    // Lets the modal pin "Me" as a suggestion without a round
                    // trip - the current user's own record is already loaded.
                    'currentUser' => $currentUser,
                ],
                [
                    'type' => 'user-picker',
                    'name' => 'createdby',
                    'label' => $lll.'createdby',
                    'options' => [],
                    'currentUser' => $currentUser,
                ],
            ],
        ];
    }

    /**
     * @return list<int>
     */
    private function resolveUpdated(string $preset, FilterContext $context): array
    {
        [$operator, $threshold] = $this->parsePreset($preset);
        if (null === $operator) {
            return [];
        }

        // Effective change: pages.tstamp OR any tt_content.tstamp on the page.
        $pagesByOwnStamp = $this->resolveTimestampField('tstamp', $preset, $context);
        // For "<30d" (touched within 30 days) content matching is a simple
        // EXISTS with tstamp >= threshold. For ">1y" (untouched for a year)
        // the page must have NO content newer than the threshold - handled by
        // subtracting recently-touched pages from the own-stamp candidates.
        $queryBuilder = $this->queryHelper->createQueryBuilder('tt_content', $context);
        $queryBuilder
            ->select('pid')
            ->distinct()
            ->from('tt_content')
            ->where(
                $queryBuilder->expr()->gt('pid', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                $queryBuilder->expr()->comparison('tstamp', '>=', $queryBuilder->createNamedParameter($threshold, Connection::PARAM_INT)),
            );
        $pagesWithRecentContent = array_map(intval(...), $queryBuilder->executeQuery()->fetchFirstColumn());

        if ('<' === $operator) {
            return array_values(array_unique(array_merge($pagesByOwnStamp, $pagesWithRecentContent)));
        }

        $recent = array_flip($pagesWithRecentContent);

        return array_values(array_filter($pagesByOwnStamp, static fn (int $uid): bool => !isset($recent[$uid])));
    }

    /**
     * @return list<int>
     */
    private function resolveTimestampField(string $field, string $preset, FilterContext $context): array
    {
        [$operator, $threshold] = $this->parsePreset($preset);
        if (null === $operator) {
            return [];
        }
        $comparison = '<' === $operator ? '>=' : '<';

        return $this->fetchPageUids($context, static function (QueryBuilder $queryBuilder) use ($field, $comparison, $threshold): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->comparison($field, $comparison, $queryBuilder->createNamedParameter($threshold, Connection::PARAM_INT)),
            );
        });
    }

    /**
     * Pages the given BE user has touched, resolved via sys_history
     * (cruser_id was removed from the core in v12). v1 limitation: page
     * records only - content-element edits by the user do not surface the
     * page here.
     *
     * @return list<int>
     */
    private function resolveBy(string $value, FilterContext $context, int $actionType): array
    {
        $userId = 'me' === $value ? (int) ($context->backendUser->user['uid'] ?? 0) : (int) $value;
        if ($userId <= 0) {
            return [];
        }

        $queryBuilder = $this->queryHelper->createQueryBuilder('sys_history', $context);
        $queryBuilder->getRestrictions()->removeAll();
        $queryBuilder
            ->select('recuid')
            ->distinct()
            ->from('sys_history')
            ->where(
                $queryBuilder->expr()->eq('tablename', $queryBuilder->createNamedParameter('pages')),
                $queryBuilder->expr()->eq('userid', $queryBuilder->createNamedParameter($userId, Connection::PARAM_INT)),
                // Without this the two keys would be indistinguishable and "edited
                // by" would also claim pages the user only ever created (and moves,
                // deletes and stage changes on top).
                $queryBuilder->expr()->eq('actiontype', $queryBuilder->createNamedParameter($actionType, Connection::PARAM_INT)),
            );

        return array_map(intval(...), $queryBuilder->executeQuery()->fetchFirstColumn());
    }

    /**
     * "<30d" -> ['<', now - 30 days]; ">1y" -> ['>', now - 1 year].
     *
     * @return array{0: '<'|'>'|null, 1: int}
     */
    private function parsePreset(string $preset): array
    {
        if (1 !== preg_match('/^(?<op>[<>])(?<num>\d+)(?<unit>[dmy])$/', $preset, $match)) {
            return [null, 0];
        }
        $seconds = (int) $match['num'] * match ($match['unit']) {
            'd' => 86400,
            'm' => 86400 * 30,
            'y' => 86400 * 365,
        };

        return [$match['op'], time() - $seconds];
    }
}
