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
 * Parses a filter phrase into tokens.
 *
 * Grammar (v1):
 *   filter   := token (WS token)*          # whitespace = AND
 *   token    := key ":" value | freetext
 *   value    := bare | quoted              # quoted for values containing spaces
 *   bare     := [^" \t]+                   # comma = OR within one criterion
 *
 * Unknown token keys are NOT an error at parse time - resolution decides.
 * Freetext (no "key:" prefix) is collected under Token::FREETEXT and passed
 * through to the core title/uid search untouched.
 */
final class TokenParser
{
    private const string PATTERN = '/(?<key>[a-z][a-z0-9_-]*):(?:"(?<quoted>[^"]*)"|(?<bare>[^\s"]+))|"(?<freequoted>[^"]*)"|(?<word>\S+)/i';

    /**
     * @return list<Token>
     */
    public function parse(string $phrase): array
    {
        $tokens = [];
        $freetextParts = [];

        if (false === preg_match_all(self::PATTERN, trim($phrase), $matches, \PREG_SET_ORDER)) {
            return [];
        }

        foreach ($matches as $match) {
            $key = strtolower($match['key'] ?? '');
            if ('' !== $key) {
                $value = ($match['quoted'] ?? '') !== '' ? $match['quoted'] : ($match['bare'] ?? '');
                $values = 'text' === $key
                    ? [$value]
                    : array_values(array_filter(
                        array_map(trim(...), explode(',', $value)),
                        static fn (string $v): bool => '' !== $v,
                    ));
                if ([] === $values) {
                    continue;
                }
                $tokens[] = new Token($key, $values, $match[0]);
                continue;
            }
            $freetextParts[] = ($match['freequoted'] ?? '') !== '' ? $match['freequoted'] : ($match['word'] ?? '');
        }

        $freetextParts = array_values(array_filter($freetextParts, static fn (string $v): bool => '' !== $v));
        if ([] !== $freetextParts) {
            $joined = implode(' ', $freetextParts);
            $tokens[] = new Token(Token::FREETEXT, [$joined], $joined);
        }

        return $tokens;
    }

    /**
     * @param list<Token> $tokens
     */
    public function hasKeyedTokens(array $tokens): bool
    {
        foreach ($tokens as $token) {
            if (!$token->isFreetext()) {
                return true;
            }
        }

        return false;
    }
}
