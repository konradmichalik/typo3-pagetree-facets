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
 * Serializes tokens back into the canonical phrase. Ordering is stable
 * (alphabetical by key, freetext last) so favorites compare reliably.
 */
final class TokenSerializer
{
    /**
     * @param list<Token> $tokens
     */
    public function serialize(array $tokens): string
    {
        $keyed = [];
        $freetext = '';

        foreach ($tokens as $token) {
            if ($token->isFreetext()) {
                $freetext = $token->firstValue();
                continue;
            }
            $keyed[] = $token;
        }

        usort($keyed, static fn (Token $a, Token $b): int => [$a->key, $a->values] <=> [$b->key, $b->values]);

        $parts = array_map(self::serializeToken(...), $keyed);
        if ('' !== $freetext) {
            $parts[] = str_contains($freetext, ' ') ? '"'.$freetext.'"' : $freetext;
        }

        return implode(' ', $parts);
    }

    private static function serializeToken(Token $token): string
    {
        $value = implode(',', $token->values);
        if (1 === preg_match('/[\s"]/', $value)) {
            $value = '"'.str_replace('"', '', $value).'"';
        }

        return $token->key.':'.$value;
    }
}
