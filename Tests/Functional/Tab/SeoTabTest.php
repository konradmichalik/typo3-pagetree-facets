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

namespace KonradMichalik\PagetreeLens\Tests\Functional\Tab;

use KonradMichalik\PagetreeLens\Tab\SeoTab;
use PHPUnit\Framework\Attributes\Test;

/**
 * Loads EXT:seo - the tab's fields (no_index, no_follow) only exist with it.
 */
final class SeoTabTest extends AbstractTabTestCase
{
    protected array $coreExtensionsToLoad = ['seo'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__ . '/../Fixtures/SeoTab.csv');
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
}
