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

namespace KonradMichalik\PagetreeFacets\Service;

use Doctrine\DBAL\ArrayParameterType;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction;

/**
 * PageAncestryService.
 *
 * Batched uid=>pid resolution for whole result sets at once: each round
 * fetches the still-unknown parents of the previous round in one IN() query,
 * so the number of queries scales with the tree DEPTH, never with the number
 * of matched pages. This is what lets the scope services (site:/under:)
 * post-filter tens of thousands of matches without a per-page rootline
 * lookup (BEgetRootLine would issue one query per page and ancestor).
 */
/*
 * Not final: the scope service unit tests replace it with a test double
 * carrying a fixture pid map (same reasoning as ContentQueryHelper).
 */

/**
 * PageAncestryService.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
class PageAncestryService
{
    /**
     * Stays comfortably below every platform's placeholder limit
     * (SQLite historically 999, hence not 1000).
     */
    private const CHUNK_SIZE = 900;

    public function __construct(
        private readonly ConnectionPool $connectionPool,
    ) {}

    /**
     * uid => pid for every given page and all of its ancestors up to the tree
     * root. Deleted pages are skipped (a chain through a deleted parent ends
     * there - mirroring BEgetRootLine's view of the tree); unknown uids are
     * simply absent from the map.
     *
     * @param list<int> $uids
     *
     * @return array<int, int>
     */
    public function buildPidMap(array $uids): array
    {
        $pidMap = [];
        $frontier = array_values(array_unique(array_filter($uids, static fn (int $uid): bool => $uid > 0)));

        while ([] !== $frontier) {
            $parents = [];
            foreach (array_chunk($frontier, self::CHUNK_SIZE) as $chunk) {
                foreach ($this->fetchPids($chunk) as $uid => $pid) {
                    $pidMap[$uid] = $pid;
                    $parents[$pid] = true;
                }
            }
            // Only ascend to parents not resolved yet - this both deduplicates
            // shared ancestors across the whole set and terminates on corrupt
            // pid cycles (a revisited uid is already in the map).
            $frontier = array_values(array_filter(
                array_keys($parents),
                static fn (int $pid): bool => $pid > 0 && !isset($pidMap[$pid]),
            ));
        }

        return $pidMap;
    }

    /**
     * @param non-empty-list<int> $uids
     *
     * @return array<int, int>
     */
    private function fetchPids(array $uids): array
    {
        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('pages');
        $queryBuilder->getRestrictions()->removeAll()->add(new DeletedRestriction());
        $rows = $queryBuilder
            ->select('uid', 'pid')
            ->from('pages')
            ->where($queryBuilder->expr()->in('uid', $queryBuilder->createNamedParameter($uids, ArrayParameterType::INTEGER)))
            ->executeQuery()
            ->fetchAllAssociative();

        $pids = [];
        foreach ($rows as $row) {
            $pids[(int) $row['uid']] = (int) $row['pid'];
        }

        return $pids;
    }
}
