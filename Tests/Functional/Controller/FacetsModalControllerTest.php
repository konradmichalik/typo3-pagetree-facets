<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Controller;

use KonradMichalik\PagetreeFacets\Controller\FacetsModalController;
use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ResponseInterface;
use TYPO3\CMS\Core\Configuration\SiteWriter;
use TYPO3\CMS\Core\Http\ServerRequest;
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

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/be_users.csv');
        $backendUser = $this->setUpBackendUser(1);
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($backendUser);
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

    /**
     * @return array<string, mixed>
     */
    private function decode(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, \JSON_THROW_ON_ERROR);
    }
}
