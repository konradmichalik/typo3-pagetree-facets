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

namespace KonradMichalik\PagetreeLens\Tests\Unit\Token;

use KonradMichalik\PagetreeLens\Token\TokenParser;
use KonradMichalik\PagetreeLens\Token\TokenSerializer;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

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
    public function roundTripsCanonicalPhrase(): void
    {
        $parser = new TokenParser();
        $serializer = new TokenSerializer();
        $canonical = $serializer->serialize($parser->parse('is:empty doktype:1 site:main updated:>1y'));
        self::assertSame($canonical, $serializer->serialize($parser->parse($canonical)));
    }
}
