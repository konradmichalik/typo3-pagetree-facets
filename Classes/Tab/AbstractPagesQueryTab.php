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

use KonradMichalik\PagetreeLens\Api\{FilterContext, FilterTabInterface};
use KonradMichalik\PagetreeLens\Service\ContentQueryHelper;
use KonradMichalik\PagetreeLens\Token\Token;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

use function in_array;

/**
 * AbstractPagesQueryTab.
 *
 * Base for tabs whose criteria are conditions on the pages table itself.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
abstract class AbstractPagesQueryTab implements FilterTabInterface
{
    public function __construct(
        protected readonly ContentQueryHelper $queryHelper,
    ) {}

    public function getGroup(): ?string
    {
        return null;
    }

    /**
     * Default: one field named after the tab, straightforward mapping.
     * Tabs with richer UIs override serialize()/hydrate() themselves.
     *
     * @param array<string, mixed> $modalState
     *
     * @return list<Token>
     */
    public function serialize(array $modalState): array
    {
        $tokens = [];
        foreach ($this->getTokenKeys() as $key) {
            $values = (array) ($modalState[$key] ?? []);
            $values = array_values(array_filter(array_map(strval(...), $values), static fn (string $v): bool => '' !== $v));
            if ([] !== $values) {
                $tokens[] = new Token($key, $values, $key.':'.implode(',', $values));
            }
        }

        return $tokens;
    }

    /**
     * @param list<Token> $tokens
     *
     * @return array<string, mixed>
     */
    public function hydrate(array $tokens): array
    {
        $state = [];
        foreach ($tokens as $token) {
            if (in_array($token->key, $this->getTokenKeys(), true)) {
                $state[$token->key] = $token->values;
            }
        }

        return $state;
    }

    /**
     * @return list<int>
     */
    protected function fetchPageUids(FilterContext $context, callable $constrain): array
    {
        $queryBuilder = $this->queryHelper->createQueryBuilder('pages', $context);
        $queryBuilder->select('uid')->from('pages');
        $constrain($queryBuilder);

        return array_map(intval(...), $queryBuilder->executeQuery()->fetchFirstColumn());
    }

    protected function excludeNonContentDoktypes(QueryBuilder $queryBuilder): void
    {
        $queryBuilder->andWhere(
            $queryBuilder->expr()->notIn(
                'doktype',
                $queryBuilder->createNamedParameter(ContentQueryHelper::NON_CONTENT_DOKTYPES, Connection::PARAM_INT_ARRAY),
            ),
        );
    }
}
