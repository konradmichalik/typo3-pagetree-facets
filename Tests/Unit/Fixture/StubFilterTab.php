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

namespace KonradMichalik\PagetreeLens\Tests\Unit\Fixture;

use KonradMichalik\PagetreeLens\Api\FilterContext;
use KonradMichalik\PagetreeLens\Api\FilterTabInterface;
use KonradMichalik\PagetreeLens\Token\Token;

/**
 * Minimal tab double: resolves tokens via a static "key:value,value" => uids
 * map. Shared by registry and engine unit tests.
 */
final class StubFilterTab implements FilterTabInterface
{
    /**
     * @param list<string> $tokenKeys
     * @param array<string, list<int>> $uidMap
     */
    public function __construct(
        private readonly string $identifier,
        private readonly array $tokenKeys,
        private readonly array $uidMap = [],
    ) {}

    public function getIdentifier(): string
    {
        return $this->identifier;
    }

    public function getLabel(): string
    {
        return $this->identifier;
    }

    public function getGroup(): ?string
    {
        return null;
    }

    public function getTokenKeys(): array
    {
        return $this->tokenKeys;
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        return $this->uidMap[$token->key . ':' . implode(',', $token->values)] ?? [];
    }

    public function getModalConfiguration(FilterContext $context): array
    {
        return ['fields' => []];
    }

    public function serialize(array $modalState): array
    {
        return [];
    }

    public function hydrate(array $tokens): array
    {
        return [];
    }
}
