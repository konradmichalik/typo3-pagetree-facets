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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Fixture;

use KonradMichalik\PagetreeFacets\Api\FacetInterface;
use KonradMichalik\PagetreeFacets\Service\{ContentQueryHelper, FacetRegistry, FilterResolutionService, MatchedPageRegistry, PageAncestryService, PageSubtreeScopeService, SiteScopeService, TreeFilterResolver};
use KonradMichalik\PagetreeFacets\Token\TokenParser;
use PHPUnit\Framework\MockObject\Stub;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;
use TYPO3\CMS\Core\Exception\SiteNotFoundException;
use TYPO3\CMS\Core\Site\Entity\Site;
use TYPO3\CMS\Core\Site\SiteFinder;

/**
 * BuildsTreeFilterResolver.
 *
 * A fully wired TreeFilterResolver over stub facets, shared by the tests of
 * both core adapters: the v14 event listener and the v13 middleware. They are
 * two translations of the same hit list, and the only way to keep asserting
 * that is to give both the identical engine underneath.
 *
 * Real TokenParser, FacetRegistry and FilterResolutionService (all final, and
 * all part of what is under test here); stubs only where a query would
 * otherwise hit the database.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
trait BuildsTreeFilterResolver
{
    /**
     * @param array<string, list<int>> $siteMap                site identifier => page uids
     * @param array<string, string>    $extensionConfiguration
     * @param array<string, list<int>> $freetextUids           freetext needle => page uids
     */
    private function createResolver(array $siteMap = [], array $extensionConfiguration = [], array $freetextUids = [], ?FacetInterface $doktypeTab = null, ?MatchedPageRegistry $matchedPages = null): TreeFilterResolver
    {
        $doktypeTab ??= new StubFacet('doktype', ['doktype'], ['doktype:1' => [10, 20, 30, 40]]);
        $stateTab = new StubFacet('state', ['is'], ['is:empty' => [20, 40, 50], 'is:hidden' => [30]]);

        $extensionConfigurationMock = self::createStub(ExtensionConfiguration::class);
        $extensionConfigurationMock->method('get')->willReturnCallback(
            static fn (string $extension, string $path = ''): string => $extensionConfiguration[$path] ?? '',
        );
        $registry = new FacetRegistry(
            new CollectingEventDispatcher([[$doktypeTab, 70], [$stateTab, 60]]),
            $extensionConfigurationMock,
        );

        $queryHelper = self::createStub(ContentQueryHelper::class);
        $queryHelper->method('getMatchingPageUids')->willReturnCallback(
            static fn (string $needle): array => $freetextUids[$needle] ?? [],
        );

        $filterResolutionService = new FilterResolutionService(
            $registry,
            new SiteScopeService($this->createSiteFinder($siteMap), $this->createAncestry($siteMap)),
            new PageSubtreeScopeService(self::createStub(PageAncestryService::class)),
            $queryHelper,
        );

        return new TreeFilterResolver(
            new TokenParser(),
            $registry,
            $filterResolutionService,
            $matchedPages ?? new MatchedPageRegistry(),
        );
    }

    /**
     * @param array<string, list<int>> $siteMap identifier => page uids (first uid's site root = ordinal)
     */
    private function createSiteFinder(array $siteMap): SiteFinder
    {
        $identifierToRoot = [];
        $root = 0;
        foreach (array_keys($siteMap) as $identifier) {
            $identifierToRoot[$identifier] = ++$root;
        }

        $siteFinder = self::createStub(SiteFinder::class);
        $siteFinder->method('getSiteByIdentifier')->willReturnCallback(
            function (string $identifier) use ($identifierToRoot): Site {
                if (!isset($identifierToRoot[$identifier])) {
                    throw new SiteNotFoundException('', 1752600002);
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
     * Pid map matching createSiteFinder(): every page uid of the n-th site
     * hangs directly under that site's root page (uid n).
     *
     * @param array<string, list<int>> $siteMap
     */
    private function createAncestry(array $siteMap): PageAncestryService
    {
        $pidMap = [];
        $root = 0;
        foreach ($siteMap as $pageUids) {
            $pidMap[++$root] = 0;
            foreach ($pageUids as $pageUid) {
                $pidMap[$pageUid] = $root;
            }
        }

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

    /**
     * @param array<string, mixed> $tsConfig
     */
    private function createBackendUser(array $tsConfig = []): BackendUserAuthentication&Stub
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getTSConfig')->willReturn($tsConfig);
        $backendUser->method('isAdmin')->willReturn(true);
        $backendUser->workspace = 0;

        return $backendUser;
    }
}
