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
 * TokenParser.
 *
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
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class TokenParser
{
    private const string PATTERN = '/(?<key>[a-z][a-z0-9_-]*):(?:"(?<quoted>[^"]*)"|(?<bare>[^\s"]+))|"(?<freequoted>[^"]*)"|(?<word>\S+)/i';

    /**
     * @return list<Token>
     */
    public function parse(string $phrase): array
    {
        if (false === preg_match_all(self::PATTERN, trim($phrase), $matches, \PREG_SET_ORDER)) {
            return [];
        }

        $tokens = [];
        $freetextParts = [];
        foreach ($matches as $match) {
            if ('' !== ($match['key'] ?? '')) {
                $token = $this->buildKeyedToken($match);
                if (null !== $token) {
                    $tokens[] = $token;
                }
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

    /**
     * @param array<int|string, string> $match
     */
    private function buildKeyedToken(array $match): ?Token
    {
        $key = strtolower($match['key']);
        if ('' === $key) {
            return null;
        }
        $value = ($match['quoted'] ?? '') !== '' ? $match['quoted'] : ($match['bare'] ?? '');
        // "text:" keeps its value verbatim (phrase search); every other key
        // splits comma-separated values into OR-combined alternatives.
        $values = 'text' === $key
            ? [$value]
            : array_values(array_filter(
                array_map(trim(...), explode(',', $value)),
                static fn (string $v): bool => '' !== $v,
            ));

        return [] === $values ? null : new Token($key, $values, $match[0]);
    }
}
