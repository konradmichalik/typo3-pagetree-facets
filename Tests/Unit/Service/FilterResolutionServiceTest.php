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

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\{ContentQueryHelper, FacetRegistry, PageAncestryService, PageSubtreeScopeService, SiteScopeService};
use KonradMichalik\PagetreeFacets\Service\FilterResolutionService;
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\{CollectingEventDispatcher, StubFacet};
use KonradMichalik\PagetreeFacets\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;
use TYPO3\CMS\Core\Exception\SiteNotFoundException;
use TYPO3\CMS\Core\Site\Entity\Site;
use TYPO3\CMS\Core\Site\SiteFinder;

/**
 * FilterResolutionServiceTest.
 *
 * Extracted from PageTreeFilterListenerTest's own fixtures - this is the same
 * engine contract (AND intersection, site/page scope), tested directly against
 * the service rather than through the event-adapter shape.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FilterResolutionServiceTest extends TestCase
{
    #[Test]
    public function singleCriterionResolvesMatchingUids(): void
    {
        $uids = $this->createService()->resolve(
            [new Token('doktype', ['1'], 'doktype:1')],
            $this->createContext(),
        );

        self::assertSame([10, 20, 30, 40], $uids);
    }

    #[Test]
    public function multipleCriteriaAreIntersected(): void
    {
        $uids = $this->createService()->resolve(
            [new Token('doktype', ['1'], 'doktype:1'), new Token('is', ['empty'], 'is:empty')],
            $this->createContext(),
        );

        self::assertSame([20, 40], $uids);
    }

    #[Test]
    public function emptyIntersectionResolvesToAnEmptyListRatherThanNull(): void
    {
        $uids = $this->createService()->resolve(
            [new Token('is', ['hidden'], 'is:hidden'), new Token('is', ['empty'], 'is:empty')],
            $this->createContext(),
        );

        self::assertSame([], $uids);
    }

    #[Test]
    public function onlyUnknownOrScopeTokensResolveToNull(): void
    {
        self::assertNull($this->createService()->resolve(
            [new Token('status', ['3'], 'status:3')],
            $this->createContext(),
        ));

        self::assertNull($this->createService()->resolve(
            [new Token('under', ['5'], 'under:5')],
            $this->createContext(),
        ));
    }

    #[Test]
    public function freetextIsResolvedAndIntersectedLikeAnyOtherCriterion(): void
    {
        $uids = $this->createService(freetextUids: ['solar' => [20, 99]])->resolve(
            [new Token('doktype', ['1'], 'doktype:1'), new Token(Token::FREETEXT, ['solar'], 'solar')],
            $this->createContext(),
        );

        self::assertSame([20], $uids);
    }

    #[Test]
    public function siteScopePostFiltersTheResult(): void
    {
        $uids = $this->createService(siteMap: ['main' => [20, 30]])->resolve(
            [new Token('doktype', ['1'], 'doktype:1')],
            $this->createContext(siteIdentifier: 'main'),
        );

        self::assertSame([20, 30], $uids);
    }

    #[Test]
    public function pageScopePostFiltersTheResultByRootline(): void
    {
        $pidMap = [2 => 1, 10 => 2, 20 => 1, 30 => 1, 40 => 1];
        $uids = $this->createService(pidMap: $pidMap)->resolve(
            [new Token('doktype', ['1'], 'doktype:1'), new Token('under', ['2'], 'under:2')],
            $this->createContext(),
        );

        self::assertSame([10], $uids);
    }

    /**
     * @param array<string, list<int>> $siteMap
     * @param array<string, list<int>> $freetextUids
     * @param array<int, int>          $pidMap
     */
    private function createService(array $siteMap = [], array $freetextUids = [], array $pidMap = []): FilterResolutionService
    {
        // Auto-generate pidMap from siteMap when not explicitly provided
        if ([] === $pidMap && [] !== $siteMap) {
            $identifierToRoot = [];
            $root = 0;
            foreach (array_keys($siteMap) as $identifier) {
                $identifierToRoot[$identifier] = ++$root;
            }

            foreach ($siteMap as $identifier => $uids) {
                $siteRoot = $identifierToRoot[$identifier];
                foreach ($uids as $uid) {
                    $pidMap[$uid] = $siteRoot;
                }
            }
        }

        $doktypeTab = new StubFacet('doktype', ['doktype'], ['doktype:1' => [10, 20, 30, 40]]);
        $stateTab = new StubFacet('state', ['is'], ['is:empty' => [20, 40, 50], 'is:hidden' => [30]]);

        $extensionConfigurationStub = self::createStub(ExtensionConfiguration::class);
        $extensionConfigurationStub->method('get')->willReturn('');
        $registry = new FacetRegistry(
            new CollectingEventDispatcher([[$doktypeTab, 70], [$stateTab, 60]]),
            $extensionConfigurationStub,
        );

        $queryHelper = self::createStub(ContentQueryHelper::class);
        $queryHelper->method('getMatchingPageUids')->willReturnCallback(
            static fn (string $needle): array => $freetextUids[$needle] ?? [],
        );

        $ancestry = self::createStub(PageAncestryService::class);
        $ancestry->method('buildPidMap')->willReturn($pidMap);

        return new FilterResolutionService(
            $registry,
            new SiteScopeService($this->createSiteFinder($siteMap), $ancestry),
            new PageSubtreeScopeService($ancestry),
            $queryHelper,
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
            static function (string $identifier) use ($identifierToRoot): Site {
                if (!isset($identifierToRoot[$identifier])) {
                    throw new SiteNotFoundException('', 1755000001);
                }

                $site = self::createStub(Site::class);
                $site->method('getRootPageId')->willReturn($identifierToRoot[$identifier]);

                return $site;
            },
        );
        $siteFinder->method('getAllSites')->willReturn(array_map(
            static function (int $rootPageId): Site {
                $site = self::createStub(Site::class);
                $site->method('getRootPageId')->willReturn($rootPageId);

                return $site;
            },
            array_values($identifierToRoot),
        ));

        return $siteFinder;
    }

    private function createContext(?string $siteIdentifier = null): FilterContext
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getTSConfig')->willReturn([]);
        $backendUser->method('isAdmin')->willReturn(true);
        $backendUser->workspace = 0;

        return new FilterContext(backendUser: $backendUser, workspaceId: 0, siteIdentifier: $siteIdentifier);
    }
}
