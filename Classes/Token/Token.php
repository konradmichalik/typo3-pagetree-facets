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

namespace KonradMichalik\PagetreeLens\Token;

/**
 * Token.
 *
 * A single parsed filter token. Comma-separated values within one token are
 * OR-combined ("doktype:1,4"), separate tokens are AND-combined.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class Token
{
    public const string FREETEXT = '_freetext';

    /**
     * @param non-empty-string $key    Token key, e.g. "doktype", "is", "text". Freetext uses Token::FREETEXT.
     * @param list<string>     $values OR-combined values of this token
     * @param string           $raw    Original raw representation (for round-tripping)
     */
    public function __construct(
        public string $key,
        public array $values,
        public string $raw,
    ) {}

    public function isFreetext(): bool
    {
        return self::FREETEXT === $this->key;
    }

    public function firstValue(): string
    {
        return $this->values[0] ?? '';
    }
}
