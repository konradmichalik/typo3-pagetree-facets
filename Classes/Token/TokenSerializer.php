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

namespace KonradMichalik\PagetreeFacets\Token;

/**
 * TokenSerializer.
 *
 * Serializes tokens back into the canonical phrase. Ordering is stable
 * (alphabetical by key, freetext last) so favorites compare reliably.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
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
            $parts[] = self::quoteValue($freetext);
        }

        return implode(' ', $parts);
    }

    private static function serializeToken(Token $token): string
    {
        return $token->key.':'.self::quoteValue(implode(',', $token->values));
    }

    /**
     * Literal quotes are stripped, not escaped - the grammar has no escape
     * sequence, and a quote surviving into the phrase would end the quoted
     * range early and let the remainder re-parse as extra keyed tokens.
     */
    private static function quoteValue(string $value): string
    {
        return 1 === preg_match('/[\s"]/', $value) ? '"'.str_replace('"', '', $value).'"' : $value;
    }
}
