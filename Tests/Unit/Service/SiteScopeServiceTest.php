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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Service;

use KonradMichalik\PagetreeFacets\Service\{PageAncestryService, SiteScopeService};
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
        $subject = new SiteScopeService(
            $this->createSiteFinder(['main' => 1, 'other' => 2]),
            $this->createAncestry([1 => 0, 2 => 0, 20 => 1, 30 => 1, 40 => 2]),
        );

        // uid 10 resolves to no known page at all -> dropped alongside 40 (other site).
        self::assertSame([20, 30], $subject->filterUidsBySite([10, 20, 30, 40], 'main'));
    }

    #[Test]
    public function unknownSiteIdentifierLeavesUidsUntouched(): void
    {
        // Favorite robustness: a favorite may reference a meanwhile-removed
        // site - the scope is ignored, never an error.
        $subject = new SiteScopeService(
            $this->createSiteFinder([]),
            $this->createAncestry([]),
        );

        self::assertSame([10, 20], $subject->filterUidsBySite([10, 20], 'gone'));
    }

    #[Test]
    public function anEmptyUidListStaysEmpty(): void
    {
        // Guard ahead of the pid map: when the token intersection upstream already
        // came out empty there is nothing to scope, and the service must not turn
        // that into a query. Empty in, empty out - never "no constraint".
        $subject = new SiteScopeService(
            $this->createSiteFinder(['main' => 1]),
            $this->createAncestry([1 => 0]),
        );

        self::assertSame([], $subject->filterUidsBySite([], 'main'));
    }

    #[Test]
    public function pagesWithoutResolvableSiteAreDropped(): void
    {
        $subject = new SiteScopeService(
            $this->createSiteFinder(['main' => 1]),
            $this->createAncestry([1 => 0, 20 => 1]),
        );

        self::assertSame([20], $subject->filterUidsBySite([20, 999], 'main'));
    }

    #[Test]
    public function aNestedSiteBelongsToItsNearestRootNotTheEnclosingSite(): void
    {
        // Site "nested" has its root page (5) INSIDE main's tree: 1 > 3 > 5 > 6.
        // Page 6 must resolve to "nested", not "main" - the nearest site root
        // up the chain wins, mirroring SiteFinder::getSiteByPageId().
        $siteFinder = $this->createSiteFinder(['main' => 1, 'nested' => 5]);
        $ancestry = $this->createAncestry([1 => 0, 3 => 1, 5 => 3, 6 => 5]);

        self::assertSame([3], (new SiteScopeService($siteFinder, $ancestry))->filterUidsBySite([3, 6], 'main'));
        self::assertSame([6], (new SiteScopeService($siteFinder, $ancestry))->filterUidsBySite([3, 6], 'nested'));
    }

    /**
     * @param array<string, int> $identifierToRoot
     */
    private function createSiteFinder(array $identifierToRoot): SiteFinder
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
        $siteFinder->method('getAllSites')->willReturn(
            array_map($this->createSite(...), array_values($identifierToRoot)),
        );

        return $siteFinder;
    }

    /**
     * @param array<int, int> $pidMap
     */
    private function createAncestry(array $pidMap): PageAncestryService
    {
        $ancestry = self::createStub(PageAncestryService::class);
        $ancestry->method('buildPidMap')->willReturn($pidMap);

        return $ancestry;
    }

    private function createSite(int $rootPageId): Site
    {
        $site = self::createStub(Site::class);
        $site->method('getRootPageId')->willReturn($rootPageId);

        return $site;
    }
}
