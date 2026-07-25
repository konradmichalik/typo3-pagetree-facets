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

use KonradMichalik\PagetreeLens\Token\{TokenParser};
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

final class TokenParserTest extends TestCase
{
    private TokenParser $subject;

    protected function setUp(): void
    {
        $this->subject = new TokenParser();
    }

    #[Test]
    public function parsesKeyedTokenWithCommaOrValues(): void
    {
        $tokens = $this->subject->parse('doktype:1,4');
        self::assertSame('doktype', $tokens[0]->key);
        self::assertSame(['1', '4'], $tokens[0]->values);
    }

    #[Test]
    public function joinsFreetextAndKeepsKeyedTokensSeparate(): void
    {
        $tokens = $this->subject->parse('doktype:1 is:empty solar park');
        self::assertCount(3, $tokens);
        self::assertTrue($tokens[2]->isFreetext());
        self::assertSame('solar park', $tokens[2]->firstValue());
    }

    #[Test]
    public function quotedTextValueKeepsSpacesAndCommasLiteral(): void
    {
        $tokens = $this->subject->parse('table:tx_news_domain_model_news text:"Solar, Wind"');
        self::assertSame('text', $tokens[1]->key);
        self::assertSame(['Solar, Wind'], $tokens[1]->values);
    }

    #[Test]
    public function parsesQuotedFreetext(): void
    {
        $tokens = $this->subject->parse('"annual report"');
        self::assertTrue($tokens[0]->isFreetext());
        self::assertSame('annual report', $tokens[0]->firstValue());
    }

    #[Test]
    public function operatorValuesSurvive(): void
    {
        self::assertSame(['<30d'], $this->subject->parse('updated:<30d')[0]->values);
    }

    #[Test]
    public function innerColonIsKeptInValue(): void
    {
        self::assertSame(['tx_news_domain_model_news:42'], $this->subject->parse('record:tx_news_domain_model_news:42')[0]->values);
    }

    #[Test]
    public function emptyPhraseYieldsNoTokens(): void
    {
        self::assertSame([], $this->subject->parse('   '));
    }

    #[Test]
    public function detectsKeyedTokens(): void
    {
        self::assertTrue($this->subject->hasKeyedTokens($this->subject->parse('is:hidden foo')));
        self::assertFalse($this->subject->hasKeyedTokens($this->subject->parse('just words')));
    }
}
