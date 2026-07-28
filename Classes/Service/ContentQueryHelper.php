<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeFacets\Service;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use TYPO3\CMS\Core\Database\{Connection, ConnectionPool};
use TYPO3\CMS\Core\Database\Query\QueryBuilder;
use TYPO3\CMS\Core\Database\Query\Restriction\{DeletedRestriction, WorkspaceRestriction};
use TYPO3\CMS\Core\Schema\Field\{DateTimeFieldType, FieldTypeInterface, NumberFieldType};
use TYPO3\CMS\Core\Schema\SearchableSchemaFieldsCollector;

/**
 * Shared query building for everything that looks at tt_content or record
 * tables: is:empty, ce:<CType>, table:/record:/text:. Single place to keep
 * deleted/workspace restrictions consistent - and the place where a future
 * language dimension (translation gaps on CE level) will dock.
 */
/*
 * Not final: the single service the engine unit tests need to replace with a
 * test double (mocking a QueryBuilder chain instead would test nothing).
 */

/**
 * ContentQueryHelper.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */

class ContentQueryHelper
{
    /**
     * Doktypes that naturally carry no content - excluded from "is:empty"
     * and "seo:*" so shortcuts/folders do not flood the results.
     */
    public const array NON_CONTENT_DOKTYPES = [3, 4, 7, 199, 254, 255]; // external, shortcut, mountpoint, spacer, sysfolder, recycler

    public function __construct(
        private readonly ConnectionPool $connectionPool,
        private readonly SearchableSchemaFieldsCollector $searchableFieldsCollector,
    ) {}

    public function createQueryBuilder(string $table, FilterContext $context): QueryBuilder
    {
        $queryBuilder = $this->connectionPool->getQueryBuilderForTable($table);
        $queryBuilder->getRestrictions()
            ->removeAll()
            ->add(new DeletedRestriction())
            ->add(new WorkspaceRestriction($context->workspaceId));

        return $queryBuilder;
    }

    /**
     * Page UIDs that have at least one record of the given table.
     * Hidden records count (a page with five disabled elements is not empty).
     *
     * @param array<string, mixed>                                                          $parameters
     * @param array<string, \Doctrine\DBAL\ArrayParameterType|\Doctrine\DBAL\ParameterType> $parameterTypes
     *
     * @return list<int>
     */
    public function getPageUidsWithRecords(string $table, FilterContext $context, ?string $andWhere = null, array $parameters = [], array $parameterTypes = []): array
    {
        $queryBuilder = $this->createQueryBuilder($table, $context);
        $queryBuilder
            ->select('pid')
            ->distinct()
            ->from($table)
            ->where($queryBuilder->expr()->gt('pid', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)));
        if (null !== $andWhere) {
            $queryBuilder->andWhere($andWhere);
        }
        foreach ($parameters as $name => $value) {
            // Array values NEED an explicit array parameter type - a plain
            // setParameter() silently produces broken SQL for IN(:param).
            // Passing null as the type throws in v14 (Doctrine DBAL requires a
            // concrete type), so fall back to setParameter's own default.
            if (isset($parameterTypes[$name])) {
                $queryBuilder->setParameter($name, $value, $parameterTypes[$name]);
            } else {
                $queryBuilder->setParameter($name, $value);
            }
        }

        return array_map(intval(...), $queryBuilder->executeQuery()->fetchFirstColumn());
    }

    /**
     * LIKE search across the table's searchable schema fields (the same set
     * the core live search uses via SearchableSchemaFieldsCollector; in v14
     * the former ctrl.searchFields TCA option no longer exists). Deliberate
     * limits: LIKE only, no fulltext index, no arbitrary field=value matching.
     *
     * @return list<int> page UIDs containing matching records
     */
    public function getPageUidsWithTextMatch(string $table, string $needle, FilterContext $context): array
    {
        $needle = trim($needle);
        if ('' === $needle) {
            return [];
        }

        $queryBuilder = $this->createQueryBuilder($table, $context);
        $likes = $this->buildLikeConstraints($table, $needle, $queryBuilder);
        if ([] === $likes) {
            return [];
        }
        $queryBuilder
            ->select('pid')
            ->distinct()
            ->from($table)
            ->where(
                $queryBuilder->expr()->gt('pid', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                $queryBuilder->expr()->or(...$likes),
            );

        return array_map(intval(...), $queryBuilder->executeQuery()->fetchFirstColumn());
    }

    /**
     * Page UIDs whose OWN record matches the freetext - LIKE across the pages
     * schema's searchable fields plus a direct uid match for numeric input.
     * This is the engine's defined freetext semantics when combined with
     * tokens (independent of how the core combines searchParts and searchUids).
     *
     * @return list<int>
     */
    public function getMatchingPageUids(string $needle, FilterContext $context): array
    {
        $needle = trim($needle);
        if ('' === $needle) {
            return [];
        }

        $queryBuilder = $this->createQueryBuilder('pages', $context);
        $conditions = $this->buildLikeConstraints('pages', $needle, $queryBuilder);
        if (ctype_digit($needle)) {
            $conditions[] = $queryBuilder->expr()->eq('uid', $queryBuilder->createNamedParameter((int) $needle, Connection::PARAM_INT));
        }
        if ([] === $conditions) {
            return [];
        }
        $queryBuilder
            ->select('uid')
            ->from('pages')
            ->where($queryBuilder->expr()->or(...$conditions));

        return array_map(intval(...), $queryBuilder->executeQuery()->fetchFirstColumn());
    }

    /**
     * LIKE constraints across a table's searchable string fields. Numeric and
     * datetime fields are skipped: a LIKE against them is meaningless and errors
     * on stricter platforms (e.g. PostgreSQL). Mirrors the core live search.
     *
     * @return list<string>
     */
    private function buildLikeConstraints(string $table, string $needle, QueryBuilder $queryBuilder): array
    {
        $wildcard = '%'.$queryBuilder->escapeLikeWildcards($needle).'%';
        $constraints = [];
        /** @var FieldTypeInterface $field */
        foreach ($this->searchableFieldsCollector->getFields($table) as $field) {
            if ($field instanceof NumberFieldType || $field instanceof DateTimeFieldType) {
                continue;
            }
            $constraints[] = $queryBuilder->expr()->like(
                $field->getName(),
                $queryBuilder->createNamedParameter($wildcard),
            );
        }

        return $constraints;
    }
}
