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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Tab;

use KonradMichalik\PagetreeFacets\Tab\SeoTab;
use PHPUnit\Framework\Attributes\Test;

/**
 * SeoTabTest.
 *
 * Loads EXT:seo - the tab's fields (no_index, no_follow) only exist with it.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class SeoTabTest extends AbstractTabTestCase
{
    protected array $coreExtensionsToLoad = ['seo'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/SeoTab.csv');
    }

    #[Test]
    public function findsNoIndexAndNoFollowPages(): void
    {
        self::assertSame([2], $this->resolve($this->get(SeoTab::class), 'seo:noindex'));
        self::assertSame([3], $this->resolve($this->get(SeoTab::class), 'seo:nofollow'));
    }

    #[Test]
    public function missingDescriptionSkipsNoIndexPagesAndFolders(): void
    {
        // uid 4 is indexable without description; uid 2 also lacks one but is
        // no_index -> irrelevant for SEO; folder uid 5 is excluded by doktype.
        self::assertSame([4], $this->resolve($this->get(SeoTab::class), 'seo:missing-description'));
    }

    #[Test]
    public function multipleChecksAreCombinedAsOr(): void
    {
        self::assertSame([2, 3], $this->resolve($this->get(SeoTab::class), 'seo:noindex,nofollow'));
    }

    #[Test]
    public function anUnknownCheckResolvesToNoMatches(): void
    {
        self::assertSame([], $this->resolve($this->get(SeoTab::class), 'seo:bogus'));
    }

    #[Test]
    public function modalConfigurationOffersAllThreeChecks(): void
    {
        $configuration = $this->get(SeoTab::class)->getModalConfiguration($this->createContext());

        self::assertSame(
            ['noindex', 'nofollow', 'missing-description'],
            array_column($configuration['fields'][0]['options'], 'value'),
        );
    }

    #[Test]
    public function identityAndGroupingMetadataIsStable(): void
    {
        $tab = $this->get(SeoTab::class);

        self::assertSame('seo', $tab->getIdentifier());
        self::assertSame('quality', $tab->getGroup());
        self::assertSame(['seo'], $tab->getTokenKeys());
    }
}
