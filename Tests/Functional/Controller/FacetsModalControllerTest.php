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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Controller;

use KonradMichalik\PagetreeFacets\Controller\FacetsModalController;
use KonradMichalik\PagetreeFacets\Service\SessionFilterService;
use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ResponseInterface;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\SiteWriter;
use TYPO3\CMS\Core\Http\{PropagateResponseException, ServerRequest};
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

/**
 * FacetsModalControllerTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FacetsModalControllerTest extends FunctionalTestCase
{
    protected array $testExtensionsToLoad = [
        'konradmichalik/typo3-pagetree-facets',
    ];

    private FacetsModalController $subject;
    private BackendUserAuthentication $backendUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/be_users.csv');
        $this->backendUser = $this->setUpBackendUser(1);
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($this->backendUser);
        $this->subject = $this->get(FacetsModalController::class);
    }

    #[Test]
    public function configurationListsTabsInPriorityOrder(): void
    {
        $payload = $this->decode($this->subject->configuration(new ServerRequest()));

        // EXT:seo is not loaded -> the seo tab must NOT be registered.
        self::assertSame(
            ['ce', 'records', 'activity', 'doktype', 'state', 'translations'],
            array_column($payload['tabs'], 'identifier'),
        );
    }

    #[Test]
    public function configurationResolvesLllLabels(): void
    {
        $payload = $this->decode($this->subject->configuration(new ServerRequest()));

        foreach ($payload['tabs'] as $tab) {
            self::assertStringNotContainsString('LLL:', $tab['label'], 'Unresolved label in tab '.$tab['identifier']);
            // Field labels matter as much as the tab label: the content element
            // tab's fields are labelled with the TCA wizard group labels.
            foreach ($tab['configuration']['fields'] as $field) {
                self::assertStringNotContainsString('LLL:', $field['label'], 'Unresolved field label in tab '.$tab['identifier']);
            }
        }
    }

    #[Test]
    public function configurationHydratesTheCurrentPhraseIntoTabStates(): void
    {
        $request = (new ServerRequest())->withQueryParams(['phrase' => 'doktype:1,4 is:empty solar park']);
        $payload = $this->decode($this->subject->configuration($request));

        self::assertSame('solar park', $payload['freetext']);
        $byIdentifier = array_column($payload['tabs'], null, 'identifier');
        self::assertSame(['doktype' => ['1', '4']], $byIdentifier['doktype']['state']);
        self::assertSame(['is' => ['empty']], $byIdentifier['state']['state']);
        self::assertSame([], $byIdentifier['ce']['state']);
    }

    #[Test]
    public function serializeBuildsTheCanonicalPhrase(): void
    {
        $request = (new ServerRequest())->withParsedBody([
            'states' => [
                'state' => ['is' => ['empty']],
                'doktype' => ['doktype' => ['4', '1']],
            ],
            'site' => 'main',
            'pageScope' => 5,
            'freetext' => 'annual report',
        ]);
        $payload = $this->decode($this->subject->serialize($request));

        // Stable alphabetical order, freetext last, spaces quoted.
        self::assertSame('doktype:4,1 is:empty site:main under:5 "annual report"', $payload['phrase']);
    }

    #[Test]
    public function configurationExposesTheActiveSiteAndPageScopeFromThePhrase(): void
    {
        $request = (new ServerRequest())->withQueryParams(['phrase' => 'site:main under:5']);
        $payload = $this->decode($this->subject->configuration($request));

        self::assertSame('main', $payload['activeSite']);
        self::assertSame(5, $payload['pageScope']);
    }

    #[Test]
    public function configurationListsAccessibleSitesFromRealSiteConfiguration(): void
    {
        $this->get(SiteWriter::class)->write('main', [
            'rootPageId' => 1,
            'base' => '/',
        ]);

        $payload = $this->decode($this->subject->configuration(new ServerRequest()));

        self::assertSame([['identifier' => 'main', 'rootPageId' => 1]], $payload['sites']);
    }

    #[Test]
    public function usersSearchesByUsernameAndRealName(): void
    {
        $request = (new ServerRequest())->withQueryParams(['q' => 'jane']);
        $payload = $this->decode($this->subject->users($request));

        self::assertSame([['uid' => 2, 'label' => 'Jane Doe (jane)']], $payload['users']);
    }

    #[Test]
    public function usersExcludesDeletedUsers(): void
    {
        $request = (new ServerRequest())->withQueryParams(['q' => 'gone']);
        $payload = $this->decode($this->subject->users($request));

        self::assertSame([], $payload['users']);
    }

    #[Test]
    public function usersResolvesAnExactUidLookupIgnoringAnyQuery(): void
    {
        $request = (new ServerRequest())->withQueryParams(['uid' => '2', 'q' => 'this is ignored']);
        $payload = $this->decode($this->subject->users($request));

        self::assertSame([['uid' => 2, 'label' => 'Jane Doe (jane)']], $payload['users']);
    }

    #[Test]
    public function usersReturnsNothingWithoutAQueryOrUid(): void
    {
        $payload = $this->decode($this->subject->users(new ServerRequest()));

        self::assertSame([], $payload['users']);
    }

    #[Test]
    public function aDisabledFeatureBlocksTheConfigurationEndpoint(): void
    {
        $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['typo3_pagetree_facets']['adminOnly'] = '1';
        $this->setUpBackendUser(2); // non-admin -> locked out by adminOnly

        // The disabled feature short-circuits with a propagated 403 response
        // (the ResponsePropagation middleware returns it in a real request).
        try {
            $this->subject->configuration(new ServerRequest());
            self::fail('Expected the disabled feature to block the endpoint.');
        } catch (PropagateResponseException $exception) {
            self::assertSame(403, $exception->getResponse()->getStatusCode());
        }
    }

    #[Test]
    public function aDisabledFeatureClosesTheUserEnumerationEndpoint(): void
    {
        $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['typo3_pagetree_facets']['adminOnly'] = '1';
        $this->setUpBackendUser(2);

        $payload = $this->decode($this->subject->users((new ServerRequest())->withQueryParams(['q' => 'jane'])));

        self::assertSame([], $payload['users']);
    }

    #[Test]
    public function theUserEnumerationEndpointRequiresBeUsersListAccess(): void
    {
        // Feature on, Activity tab on - but a non-admin whose groups do not
        // grant be_users in "tables_select" must not read account names either.
        $this->setUpBackendUser(2);

        $payload = $this->decode($this->subject->users((new ServerRequest())->withQueryParams(['q' => 'jane'])));

        self::assertSame([], $payload['users']);
    }

    #[Test]
    public function theUserEnumerationEndpointOpensWithBeUsersListAccess(): void
    {
        $this->setUpBackendUser(4); // non-admin; group 1 grants tables_select on be_users

        $payload = $this->decode($this->subject->users((new ServerRequest())->withQueryParams(['q' => 'jane'])));

        self::assertSame([['uid' => 2, 'label' => 'Jane Doe (jane)']], $payload['users']);
    }

    #[Test]
    public function theUserEnumerationEndpointIsClosedWhenTheActivityTabIsDisabled(): void
    {
        // Feature stays on, but the tab that owns the "by" key is disabled - the
        // endpoint backing its picker must not enumerate be_users regardless.
        $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['typo3_pagetree_facets']['disabledTabs'] = 'activity';

        $payload = $this->decode($this->subject->users((new ServerRequest())->withQueryParams(['q' => 'jane'])));

        self::assertSame([], $payload['users']);
    }

    #[Test]
    public function rawQueryTabIsAbsentByDefault(): void
    {
        $identifiers = array_column($this->decode($this->subject->configuration(new ServerRequest()))['tabs'], 'identifier');

        self::assertNotContains('raw', $identifiers);
    }

    #[Test]
    public function rawQueryTabIsPresentWhenExplicitlyEnabled(): void
    {
        // Must be enabled before the first configuration() call on this subject -
        // TabRegistry resolves and caches the tab list per instance.
        $this->enableRawQueryTab();

        $identifiers = array_column($this->decode($this->subject->configuration(new ServerRequest()))['tabs'], 'identifier');

        self::assertContains('raw', $identifiers);
    }

    #[Test]
    public function tabGroupLabelIsResolvedNotLeftAsAnLllReference(): void
    {
        $this->enableRawQueryTab();

        $payload = $this->decode($this->subject->configuration(new ServerRequest()));

        $byIdentifier = array_column($payload['tabs'], null, 'identifier');
        self::assertSame('Advanced', $byIdentifier['raw']['group']);
    }

    #[Test]
    public function rawFieldStateRoundTripsThroughSerialize(): void
    {
        $this->enableRawQueryTab();
        $request = (new ServerRequest())->withParsedBody([
            'states' => ['raw' => ['raw' => 'tt_content|CType=uploads']],
        ]);

        $payload = $this->decode($this->subject->serialize($request));

        self::assertSame('raw:tt_content|CType=uploads', $payload['phrase']);
    }

    #[Test]
    public function favoriteEndpointsRoundTrip(): void
    {
        $addRequest = (new ServerRequest())->withParsedBody([
            'label' => 'Empty pages',
            'tokenString' => 'is:empty',
        ]);
        $payload = $this->decode($this->subject->addFavorite($addRequest));
        self::assertCount(1, $payload['favorites']);
        self::assertSame('Empty pages', $payload['favorites'][0]['label']);

        $removeRequest = (new ServerRequest())->withParsedBody(['index' => 0]);
        $payload = $this->decode($this->subject->removeFavorite($removeRequest));
        self::assertSame([], $payload['favorites']);
    }

    #[Test]
    public function everyFavoriteEndpointDescribesWhatTheSavedPhrasesFilterFor(): void
    {
        // All three answer with the complete list and the client renders it as
        // it stands, so a list without the resolved criteria would blank the
        // descriptions out until the modal is reopened.
        $addRequest = (new ServerRequest())->withParsedBody([
            'label' => 'Empty pages',
            'tokenString' => 'is:empty',
        ]);
        $payload = $this->decode($this->subject->addFavorite($addRequest));
        // The real Page state vocabulary, not a fixture's - this is the wording
        // the tab itself offers in the modal.
        self::assertSame(['Page state: Without content elements'], $payload['favorites'][0]['criteria']);

        $addSecond = (new ServerRequest())->withParsedBody([
            'label' => 'Hidden pages',
            'tokenString' => 'is:hidden',
        ]);
        $this->subject->addFavorite($addSecond);

        $removeRequest = (new ServerRequest())->withParsedBody(['index' => 0]);
        $payload = $this->decode($this->subject->removeFavorite($removeRequest));
        self::assertSame(['Page state: Hidden'], $payload['favorites'][0]['criteria']);

        $payload = $this->decode($this->subject->configuration(new ServerRequest()));
        self::assertSame(['Page state: Hidden'], $payload['favorites'][0]['criteria']);
    }

    #[Test]
    public function persistIsANoOpWhenTheSettingIsOff(): void
    {
        $request = (new ServerRequest())->withParsedBody(['phrase' => 'doktype:1']);

        $payload = $this->decode($this->subject->persist($request));

        self::assertSame(['ok' => true], $payload);
        self::assertSame('', $this->get(SessionFilterService::class)->get($this->backendUser));
    }

    #[Test]
    public function persistStoresThePhraseInTheSessionWhenEnabled(): void
    {
        $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['typo3_pagetree_facets']['persistFilter'] = '1';
        $request = (new ServerRequest())->withParsedBody(['phrase' => ' doktype:1 is:empty ']);

        $payload = $this->decode($this->subject->persist($request));

        self::assertSame(['ok' => true], $payload);
        self::assertSame('doktype:1 is:empty', $this->get(SessionFilterService::class)->get($this->backendUser));
    }

    private function enableRawQueryTab(): void
    {
        $GLOBALS['TYPO3_CONF_VARS']['EXTENSIONS']['typo3_pagetree_facets']['enableRawQueryTab'] = '1';
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, \JSON_THROW_ON_ERROR);
    }
}
