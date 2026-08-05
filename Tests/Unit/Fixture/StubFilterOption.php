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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Fixture;

use KonradMichalik\PagetreeFacets\Api\{FilterContext, FilterOptionInterface};

/**
 * StubFilterOption.
 *
 * Minimal option double: reports a fixed (tokenKey, value) pair and resolves to
 * a static UID list. Stands in for a third-party option in registry tests.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class StubFilterOption implements FilterOptionInterface
{
    /**
     * @param non-empty-string $tokenKey
     * @param non-empty-string $value
     * @param list<int>        $uids
     */
    public function __construct(
        private string $tokenKey,
        private string $value,
        private array $uids = [],
    ) {}

    public function getTokenKey(): string
    {
        return $this->tokenKey;
    }

    public function getValue(): string
    {
        return $this->value;
    }

    public function getLabel(): string
    {
        return $this->tokenKey.'.'.$this->value;
    }

    public function getIcon(): ?string
    {
        return null;
    }

    public function getDescription(): ?string
    {
        return null;
    }

    public function resolvePageUids(FilterContext $context): array
    {
        return $this->uids;
    }
}
