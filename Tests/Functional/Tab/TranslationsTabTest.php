<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Tab;

use KonradMichalik\PagetreeFacets\Tab\TranslationsTab;
use PHPUnit\Framework\Attributes\Test;


/**
 * TranslationsTabTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */

final class TranslationsTabTest extends AbstractTabTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/TranslationsTab.csv');
    }

    #[Test]
    public function findsDefaultLanguagePagesWithoutTranslation(): void
    {
        // uid 2 has a language-1 translation (uid 3); uid 1 (root) and uid 4
        // do not; folder uid 5 is excluded by doktype; the translation record
        // itself (uid 3) is not a candidate.
        self::assertSame([1, 4], $this->resolve($this->get(TranslationsTab::class), 'untranslated:1'));
    }

    #[Test]
    public function commaValuesMeanUntranslatedInAnyOfTheLanguages(): void
    {
        // uid 4 additionally has a language-2 translation -> untranslated:1,2
        // is the union: uid 1 (missing both), uid 2 (missing 2), uid 4 (missing 1).
        self::assertSame([1, 2, 4], $this->resolve($this->get(TranslationsTab::class), 'untranslated:1,2'));
    }
}
