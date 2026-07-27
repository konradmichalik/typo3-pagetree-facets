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

namespace KonradMichalik\PagetreeLens\Tests\Unit\EventListener;

use KonradMichalik\PagetreeLens\EventListener\PageTreeFilterListener;
use KonradMichalik\PagetreeLens\Service\{ContentQueryHelper, SiteScopeService, TabRegistry};
use KonradMichalik\PagetreeLens\Tests\Unit\Fixture\{CollectingEventDispatcher, StubFilterTab};
use KonradMichalik\PagetreeLens\Token\TokenParser;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;
use TYPO3\CMS\Core\Database\Query\Expression\CompositeExpression;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;
use TYPO3\CMS\Core\Exception\SiteNotFoundException;
use TYPO3\CMS\Core\Site\Entity\Site;
use TYPO3\CMS\Core\Site\SiteFinder;

/**
 * PageTreeFilterListenerTest.
 *
 * The engine contract: AND intersection, forced no-match, unknown-token
 * tolerance, site scoping and the configuration kill switches.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PageTreeFilterListenerTest extends TestCase
{
    protected function setUp(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser();
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['BE_USER']);
        parent::tearDown();
    }

    #[Test]
    public function freetextOnlyLeavesCoreSearchUntouched(): void
    {
        $event = $this->createEvent('solar park');
        $this->createListener()($event);

        self::assertSame([], $event->searchUids);
    }

    #[Test]
    public function singleCriterionSetsMatchingUids(): void
    {
        $event = $this->createEvent('doktype:1');
        $this->createListener()($event);

        self::assertSame([10, 20, 30, 40], $event->searchUids);
        // The core LIKE parts were built against the full token phrase and
        // must be neutralized once we applied our own result.
        self::assertSame('1=0', (string) $event->searchParts);
    }

    #[Test]
    public function freetextCombinedWithTokensIsIntersected(): void
    {
        $event = $this->createEvent('doktype:1 solar');
        $this->createListener(freetextUids: ['solar' => [20, 99]])($event);

        self::assertSame([20], $event->searchUids);
    }

    #[Test]
    public function freetextWithoutPageMatchForcesNoMatch(): void
    {
        $event = $this->createEvent('doktype:1 nirvana');
        $this->createListener()($event);

        self::assertSame([0], $event->searchUids);
    }

    #[Test]
    public function multipleCriteriaAreIntersected(): void
    {
        $event = $this->createEvent('doktype:1 is:empty');
        $this->createListener()($event);

        self::assertSame([20, 40], $event->searchUids);
    }

    #[Test]
    public function emptyIntersectionForcesNoMatchInsteadOfNoFilter(): void
    {
        $event = $this->createEvent('is:hidden is:empty');
        $this->createListener()($event);

        self::assertSame([0], $event->searchUids);
    }

    #[Test]
    public function unknownTokensAreIgnoredWhileKnownOnesApply(): void
    {
        $event = $this->createEvent('doktype:1 status:3');
        $this->createListener()($event);

        self::assertSame([10, 20, 30, 40], $event->searchUids);
    }

    #[Test]
    public function onlyUnknownTokensBehaveLikeCore(): void
    {
        $event = $this->createEvent('status:3');
        $this->createListener()($event);

        self::assertSame([], $event->searchUids);
    }

    #[Test]
    public function siteScopePostFiltersTheResult(): void
    {
        $event = $this->createEvent('doktype:1 site:main');
        $this->createListener(siteMap: ['main' => [20, 30]])($event);

        self::assertSame([20, 30], $event->searchUids);
    }

    #[Test]
    public function knownSiteWithoutOverlapForcesNoMatch(): void
    {
        $event = $this->createEvent('doktype:1 site:other');
        $this->createListener(siteMap: ['main' => [20, 30], 'other' => [99]])($event);

        self::assertSame([0], $event->searchUids);
    }

    #[Test]
    public function unknownSiteIdentifierIgnoresTheScope(): void
    {
        // Favorite robustness: favorites may reference removed sites.
        $event = $this->createEvent('doktype:1 site:gone');
        $this->createListener(siteMap: ['main' => [20, 30]])($event);

        self::assertSame([10, 20, 30, 40], $event->searchUids);
    }

    #[Test]
    public function userTsConfigDisableIsRespected(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser(['tx_pagetreelens.' => ['disable' => '1']]);
        $event = $this->createEvent('doktype:1');
        $this->createListener()($event);

        self::assertSame([], $event->searchUids);
    }

    #[Test]
    public function tokensOfTabsDisabledViaExtensionConfigurationAreIgnored(): void
    {
        $event = $this->createEvent('doktype:1 is:empty');
        $this->createListener(extensionConfiguration: ['disabledTabs' => 'state'])($event);

        self::assertSame([10, 20, 30, 40], $event->searchUids);
    }

    /**
     * @param array<string, list<int>> $siteMap
     * @param array<string, string>    $extensionConfiguration
     * @param array<string, list<int>> $freetextUids
     */
    private function createListener(array $siteMap = [], array $extensionConfiguration = [], array $freetextUids = []): PageTreeFilterListener
    {
        $doktypeTab = new StubFilterTab('doktype', ['doktype'], ['doktype:1' => [10, 20, 30, 40]]);
        $stateTab = new StubFilterTab('state', ['is'], ['is:empty' => [20, 40, 50], 'is:hidden' => [30]]);

        $extensionConfigurationMock = self::createStub(ExtensionConfiguration::class);
        $extensionConfigurationMock->method('get')->willReturnCallback(
            static fn (string $extension, string $path = ''): string => $extensionConfiguration[$path] ?? '',
        );
        $registry = new TabRegistry(
            new CollectingEventDispatcher([[$doktypeTab, 70], [$stateTab, 60]]),
            $extensionConfigurationMock,
        );

        $queryHelper = self::createStub(ContentQueryHelper::class);
        $queryHelper->method('getMatchingPageUids')->willReturnCallback(
            static fn (string $needle): array => $freetextUids[$needle] ?? [],
        );

        return new PageTreeFilterListener(
            new TokenParser(),
            $registry,
            new SiteScopeService($this->createSiteFinder($siteMap)),
            $queryHelper,
        );
    }

    /**
     * @param array<string, list<int>> $siteMap identifier => page uids (first uid's site root = ordinal)
     */
    private function createSiteFinder(array $siteMap): SiteFinder
    {
        $identifierToRoot = [];
        $pageToRoot = [];
        $root = 0;
        foreach ($siteMap as $identifier => $pageUids) {
            $identifierToRoot[$identifier] = ++$root;
            foreach ($pageUids as $pageUid) {
                $pageToRoot[$pageUid] = $root;
            }
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
        $siteFinder->method('getSiteByPageId')->willReturnCallback(
            function (int $pageId) use ($pageToRoot): Site {
                if (!isset($pageToRoot[$pageId])) {
                    throw new SiteNotFoundException('', 1752600003);
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

    private function createEvent(string $phrase): BeforePageTreeIsFilteredEvent
    {
        // Mirrors the v14 core constructor
        // (TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent):
        // an empty OR CompositeExpression for $searchParts, an empty
        // $searchUids list, the raw phrase and a QueryBuilder for context. The
        // engine never touches the QueryBuilder, so a bare mock suffices.
        return new BeforePageTreeIsFilteredEvent(
            CompositeExpression::or(),
            [],
            $phrase,
            self::createStub(QueryBuilder::class),
        );
    }
}
