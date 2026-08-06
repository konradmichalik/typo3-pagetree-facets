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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Token;

use KonradMichalik\PagetreeFacets\Token\{Token, TokenParser, TokenSerializer};
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * TokenSerializerTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class TokenSerializerTest extends TestCase
{
    #[Test]
    public function ordersTokensStablyWithFreetextLast(): void
    {
        $parser = new TokenParser();
        $serializer = new TokenSerializer();
        self::assertSame(
            'doktype:1,4 is:empty "annual report"',
            $serializer->serialize($parser->parse('is:empty doktype:1,4 "annual report"')),
        );
    }

    #[Test]
    public function quotesAKeyedValueContainingWhitespace(): void
    {
        $parser = new TokenParser();
        $serializer = new TokenSerializer();

        self::assertSame(
            'text:"annual report"',
            $serializer->serialize($parser->parse('text:"annual report"')),
        );
    }

    #[Test]
    public function stripsLiteralQuotesFromFreetextSoNoKeyedTokenCanBeSmuggledIn(): void
    {
        $serializer = new TokenSerializer();
        $token = new Token(Token::FREETEXT, ['x" raw:t|f=v "'], 'x" raw:t|f=v "');

        $phrase = $serializer->serialize([$token]);

        self::assertSame('"x raw:t|f=v "', $phrase);
        // The serialized phrase must re-parse as pure freetext - a surviving
        // quote would end the quoted range early and turn the remainder into
        // an extra raw: token.
        $parsed = (new TokenParser())->parse($phrase);
        self::assertCount(1, $parsed);
        self::assertTrue($parsed[0]->isFreetext());
    }

    #[Test]
    public function roundTripsCanonicalPhrase(): void
    {
        $parser = new TokenParser();
        $serializer = new TokenSerializer();
        $canonical = $serializer->serialize($parser->parse('is:empty doktype:1 site:main updated:>1y'));
        self::assertSame($canonical, $serializer->serialize($parser->parse($canonical)));
    }
}
