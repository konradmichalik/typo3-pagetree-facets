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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\EventListener;

use KonradMichalik\PagetreeFacets\Api\{FacetInterface, FilterContext};
use KonradMichalik\PagetreeFacets\EventListener\PageTreeFilterListener;
use KonradMichalik\PagetreeFacets\Service\{ContentQueryHelper, FacetRegistry, MatchedPageRegistry, PageAncestryService, PageSubtreeScopeService, SiteScopeService};
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\{CollectingEventDispatcher, StubFacet};
use KonradMichalik\PagetreeFacets\Token\{Token, TokenParser};
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
    public function aLiterallyRepeatedTokenIsResolvedOnlyOnce(): void
    {
        $countingTab = new class implements FacetInterface {
            public int $resolveCalls = 0;

            public function getIdentifier(): string
            {
                return 'doktype';
            }

            public function getLabel(): string
            {
                return 'doktype';
            }

            public function getGroup(): ?string
            {
                return null;
            }

            public function getTokenKeys(): array
            {
                return ['doktype'];
            }

            public function resolvePageUids(Token $token, FilterContext $context): array
            {
                ++$this->resolveCalls;

                return [10, 20, 30, 40];
            }

            public function getModalConfiguration(FilterContext $context): array
            {
                return ['fields' => []];
            }

            public function serialize(array $modalState): array
            {
                return [];
            }

            public function hydrate(array $tokens): array
            {
                return [];
            }
        };

        $event = $this->createEvent('doktype:1 doktype:1');
        $this->createListener(doktypeTab: $countingTab)($event);

        // ANDing a set with itself is a no-op, so the duplicate must not
        // trigger a second resolution (each one is a real query in production).
        self::assertSame(1, $countingTab->resolveCalls);
        self::assertSame([10, 20, 30, 40], $event->searchUids);
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
    public function pageScopeTokenIsParsedButNeverAppliedToAnAlreadyEmptyResult(): void
    {
        // The subtree scope resolves ancestry from the database (via the
        // stubbed PageAncestryService), so this deliberately stays a pure unit
        // test: forcing the intersection empty beforehand (via an unmatched
        // freetext) proves "under:" is parsed without ever reaching that
        // DB-bound lookup.
        $event = $this->createEvent('doktype:1 under:5 nirvana');
        $this->createListener()($event);

        self::assertSame([0], $event->searchUids);
    }

    #[Test]
    public function userTsConfigDisableIsRespected(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser(['tx_typo3pagetreefacets.' => ['disable' => '1']]);
        $event = $this->createEvent('doktype:1');
        $this->createListener()($event);

        self::assertSame([], $event->searchUids);
    }

    #[Test]
    public function tokensOfTabsDisabledViaExtensionConfigurationAreIgnored(): void
    {
        $event = $this->createEvent('doktype:1 is:empty');
        $this->createListener(extensionConfiguration: ['disabledFacets' => 'state'])($event);

        self::assertSame([10, 20, 30, 40], $event->searchUids);
    }

    #[Test]
    public function theResolvedHitsAreRecordedForTheSearchResultLabel(): void
    {
        $matchedPages = new MatchedPageRegistry();
        $this->createListener(matchedPages: $matchedPages)($this->createEvent('doktype:1 is:empty'));

        self::assertTrue($matchedPages->isActive());
        self::assertTrue($matchedPages->matches(20));
        self::assertTrue($matchedPages->matches(40));
        // A page the intersection dropped is a rootline ancestor at best, and
        // the tree may well still render it - it must not be marked as a hit.
        self::assertFalse($matchedPages->matches(10));
    }

    #[Test]
    public function theRecordedHitsAreScopedLikeTheResult(): void
    {
        $matchedPages = new MatchedPageRegistry();
        $this->createListener(siteMap: ['main' => [20, 30]], matchedPages: $matchedPages)($this->createEvent('doktype:1 site:main'));

        self::assertTrue($matchedPages->matches(20));
        self::assertFalse($matchedPages->matches(10));
    }

    #[Test]
    public function anEmptyResultRecordsNoHitsRatherThanTheForcedNoMatchUid(): void
    {
        // applyResult() substitutes the impossible uid 0 to express "no matches"
        // to the core. Recording that substitution would label the tree root.
        $matchedPages = new MatchedPageRegistry();
        $this->createListener(matchedPages: $matchedPages)($this->createEvent('is:hidden is:empty'));

        self::assertTrue($matchedPages->isActive());
        self::assertFalse($matchedPages->matches(0));
    }

    #[Test]
    public function aFreetextOnlyPhraseRecordsNothing(): void
    {
        // The core's own search-result label already covers that case.
        $matchedPages = new MatchedPageRegistry();
        $this->createListener(matchedPages: $matchedPages)($this->createEvent('solar park'));

        self::assertFalse($matchedPages->isActive());
    }

    #[Test]
    public function nothingIsRecordedWhileTheExtensionIsDisabledForTheUser(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser(['tx_typo3pagetreefacets.' => ['disable' => '1']]);
        $matchedPages = new MatchedPageRegistry();
        $this->createListener(matchedPages: $matchedPages)($this->createEvent('doktype:1'));

        self::assertFalse($matchedPages->isActive());
    }

    #[Test]
    public function aPhraseOfOnlyUnknownTokensRecordsNothing(): void
    {
        // The engine bows out and leaves the phrase to the core, so there is no
        // hit list of ours to mark.
        $matchedPages = new MatchedPageRegistry();
        $this->createListener(matchedPages: $matchedPages)($this->createEvent('status:3'));

        self::assertFalse($matchedPages->isActive());
    }

    /**
     * @param array<string, list<int>> $siteMap
     * @param array<string, string>    $extensionConfiguration
     * @param array<string, list<int>> $freetextUids
     */
    private function createListener(array $siteMap = [], array $extensionConfiguration = [], array $freetextUids = [], ?FacetInterface $doktypeTab = null, ?MatchedPageRegistry $matchedPages = null): PageTreeFilterListener
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

        return new PageTreeFilterListener(
            new TokenParser(),
            $registry,
            new SiteScopeService($this->createSiteFinder($siteMap), $this->createAncestry($siteMap)),
            new PageSubtreeScopeService(self::createStub(PageAncestryService::class)),
            $queryHelper,
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
