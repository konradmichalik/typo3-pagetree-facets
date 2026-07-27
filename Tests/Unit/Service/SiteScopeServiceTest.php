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

namespace KonradMichalik\PagetreeLens\Tests\Unit\Service;

use KonradMichalik\PagetreeLens\Service\SiteScopeService;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Exception\SiteNotFoundException;
use TYPO3\CMS\Core\Site\Entity\Site;
use TYPO3\CMS\Core\Site\SiteFinder;


/**
 * SiteScopeServiceTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */

final class SiteScopeServiceTest extends TestCase
{
    #[Test]
    public function keepsOnlyUidsBelongingToTheSite(): void
    {
        $subject = new SiteScopeService($this->createSiteFinder(
            ['main' => 1],
            [20 => 1, 30 => 1, 40 => 2],
        ));

        self::assertSame([20, 30], $subject->filterUidsBySite([10, 20, 30, 40], 'main'));
    }

    #[Test]
    public function unknownSiteIdentifierLeavesUidsUntouched(): void
    {
        // Favorite robustness: a favorite may reference a meanwhile-removed
        // site - the scope is ignored, never an error.
        $subject = new SiteScopeService($this->createSiteFinder([], []));

        self::assertSame([10, 20], $subject->filterUidsBySite([10, 20], 'gone'));
    }

    #[Test]
    public function pagesWithoutResolvableSiteAreDropped(): void
    {
        $subject = new SiteScopeService($this->createSiteFinder(['main' => 1], [20 => 1]));

        self::assertSame([20], $subject->filterUidsBySite([20, 999], 'main'));
    }

    /**
     * @param array<string, int> $identifierToRoot
     * @param array<int, int>    $pageToRoot
     */
    private function createSiteFinder(array $identifierToRoot, array $pageToRoot): SiteFinder
    {
        $siteFinder = self::createStub(SiteFinder::class);
        $siteFinder->method('getSiteByIdentifier')->willReturnCallback(
            function (string $identifier) use ($identifierToRoot): Site {
                if (!isset($identifierToRoot[$identifier])) {
                    throw new SiteNotFoundException('', 1752600000);
                }

                return $this->createSite($identifierToRoot[$identifier]);
            },
        );
        $siteFinder->method('getSiteByPageId')->willReturnCallback(
            function (int $pageId) use ($pageToRoot): Site {
                if (!isset($pageToRoot[$pageId])) {
                    throw new SiteNotFoundException('', 1752600001);
                }

                return $this->createSite($pageToRoot[$pageId]);
            },
        );

        return $siteFinder;
    }

    private function createSite(int $rootPageId): Site
    {
        $site = self::createStub(Site::class);
        $site->method('getRootPageId')->willReturn($rootPageId);

        return $site;
    }
}
