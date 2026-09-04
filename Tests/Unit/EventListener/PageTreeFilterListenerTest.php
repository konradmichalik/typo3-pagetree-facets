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
use KonradMichalik\PagetreeFacets\Service\MatchedPageRegistry;
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\BuildsTreeFilterResolver;
use KonradMichalik\PagetreeFacets\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Backend\Tree\Repository\BeforePageTreeIsFilteredEvent;
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Database\Query\Expression\CompositeExpression;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

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
    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();

        // BeforePageTreeIsFilteredEvent does not exist before v14 - the whole
        // reason PageTreeFilterMiddleware exists. Instantiating the event below
        // would fatal on the v13 matrix job, so the v14 adapter's tests only run
        // where the v14 adapter does; the shared engine underneath is covered on
        // both by PageTreeFilterMiddlewareTest.
        if ((new Typo3Version())->getMajorVersion() < 14) {
            self::markTestSkipped('BeforePageTreeIsFilteredEvent is a TYPO3 v14 API.');
        }
    }

    use BuildsTreeFilterResolver;

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
        $this->createListener([], [], ['solar' => [20, 99]])($event);

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
        $this->createListener([], [], [], $countingTab)($event);

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
        $this->createListener(['main' => [20, 30]])($event);

        self::assertSame([20, 30], $event->searchUids);
    }

    #[Test]
    public function knownSiteWithoutOverlapForcesNoMatch(): void
    {
        $event = $this->createEvent('doktype:1 site:other');
        $this->createListener(['main' => [20, 30], 'other' => [99]])($event);

        self::assertSame([0], $event->searchUids);
    }

    #[Test]
    public function unknownSiteIdentifierIgnoresTheScope(): void
    {
        // Favorite robustness: favorites may reference removed sites.
        $event = $this->createEvent('doktype:1 site:gone');
        $this->createListener(['main' => [20, 30]])($event);

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
        $this->createListener([], ['disabledFacets' => 'state'])($event);

        self::assertSame([10, 20, 30, 40], $event->searchUids);
    }

    #[Test]
    public function theResolvedHitsAreRecordedForTheSearchResultLabel(): void
    {
        $matchedPages = new MatchedPageRegistry();
        $this->createListener([], [], [], null, $matchedPages)($this->createEvent('doktype:1 is:empty'));

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
        $this->createListener(['main' => [20, 30]], [], [], null, $matchedPages)($this->createEvent('doktype:1 site:main'));

        self::assertTrue($matchedPages->matches(20));
        self::assertFalse($matchedPages->matches(10));
    }

    #[Test]
    public function anEmptyResultRecordsNoHitsRatherThanTheForcedNoMatchUid(): void
    {
        // applyResult() substitutes the impossible uid 0 to express "no matches"
        // to the core. Recording that substitution would label the tree root.
        $matchedPages = new MatchedPageRegistry();
        $this->createListener([], [], [], null, $matchedPages)($this->createEvent('is:hidden is:empty'));

        self::assertTrue($matchedPages->isActive());
        self::assertFalse($matchedPages->matches(0));
    }

    #[Test]
    public function aFreetextOnlyPhraseRecordsNothing(): void
    {
        // The core's own search-result label already covers that case.
        $matchedPages = new MatchedPageRegistry();
        $this->createListener([], [], [], null, $matchedPages)($this->createEvent('solar park'));

        self::assertFalse($matchedPages->isActive());
    }

    #[Test]
    public function nothingIsRecordedWhileTheExtensionIsDisabledForTheUser(): void
    {
        $GLOBALS['BE_USER'] = $this->createBackendUser(['tx_typo3pagetreefacets.' => ['disable' => '1']]);
        $matchedPages = new MatchedPageRegistry();
        $this->createListener([], [], [], null, $matchedPages)($this->createEvent('doktype:1'));

        self::assertFalse($matchedPages->isActive());
    }

    #[Test]
    public function aPhraseOfOnlyUnknownTokensRecordsNothing(): void
    {
        // The engine bows out and leaves the phrase to the core, so there is no
        // hit list of ours to mark.
        $matchedPages = new MatchedPageRegistry();
        $this->createListener([], [], [], null, $matchedPages)($this->createEvent('status:3'));

        self::assertFalse($matchedPages->isActive());
    }

    /**
     * @param array<string, list<int>> $siteMap
     * @param array<string, string>    $extensionConfiguration
     * @param array<string, list<int>> $freetextUids
     */
    private function createListener(array $siteMap = [], array $extensionConfiguration = [], array $freetextUids = [], ?FacetInterface $doktypeTab = null, ?MatchedPageRegistry $matchedPages = null): PageTreeFilterListener
    {
        return new PageTreeFilterListener(
            $this->createResolver($siteMap, $extensionConfiguration, $freetextUids, $doktypeTab, $matchedPages),
        );
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
