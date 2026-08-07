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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Service;

use KonradMichalik\PagetreeFacets\Service\PhraseSummaryService;
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

/**
 * PhraseSummaryServiceTest.
 *
 * The tab array passed in mirrors what FacetsModalController::buildTabs() hands
 * over: identifiers, labels and already-translated field options.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class PhraseSummaryServiceTest extends FunctionalTestCase
{
    protected array $testExtensionsToLoad = [
        'konradmichalik/typo3-pagetree-facets',
    ];

    private PhraseSummaryService $subject;

    protected function setUp(): void
    {
        parent::setUp();
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->create('default');
        $this->subject = $this->get(PhraseSummaryService::class);
    }

    #[Test]
    public function resolvesAValueToTheLabelTheModalShowsForIt(): void
    {
        self::assertSame(
            ['Page state: Hidden'],
            $this->subject->describe('is:hidden', [$this->pageStateTab()]),
        );
    }

    #[Test]
    public function readsEveryValueOfAMultiValueTokenAsItsOwnCriterion(): void
    {
        // "is:hidden,empty" is two criteria to the engine, and two chips in the
        // header - so two entries here.
        self::assertSame(
            ['Page state: Hidden', 'Page state: Empty'],
            $this->subject->describe('is:hidden,empty', [$this->pageStateTab()]),
        );
    }

    #[Test]
    public function namesTheFieldWhereATabHoldsMoreThanOneCriterion(): void
    {
        $criteria = $this->subject->describe('updated:<7d created:<7d', [$this->activityTab()]);

        // Both fields offer the same presets; the tab label alone could not say
        // which of them a criterion belongs to.
        self::assertSame(['Last updated: Within the last 7 days', 'Created: Within the last 7 days'], $criteria);
    }

    #[Test]
    public function keepsTheRawTokenForAKeyNoTabOwns(): void
    {
        // An unknown key, or one belonging to a tab this user has disabled -
        // precisely the part that will not survive being loaded into the form.
        self::assertSame(
            ['Page state: Hidden', 'nosuchkey:42'],
            $this->subject->describe('is:hidden nosuchkey:42', [$this->pageStateTab()]),
        );
    }

    #[Test]
    public function keepsTheRawValueWhereTheOptionIsNoLongerOffered(): void
    {
        self::assertSame(
            ['Page state: gone'],
            $this->subject->describe('is:gone', [$this->pageStateTab()]),
        );
    }

    #[Test]
    public function passesFreetextThroughAsItIs(): void
    {
        // The parser collects freetext into one token behind the keyed ones, so
        // it lands last however the phrase was typed.
        self::assertSame(
            ['Page state: Hidden', 'contact'],
            $this->subject->describe('contact is:hidden', [$this->pageStateTab()]),
        );
    }

    #[Test]
    public function namesTheSiteScope(): void
    {
        self::assertSame(['Site: main'], $this->subject->describe('site:main', []));
    }

    #[Test]
    public function resolvesThePageScopeToItsPageTitle(): void
    {
        $this->importCSVDataSet(__DIR__.'/../Fixtures/PageSubtreeScopeService.csv');

        self::assertSame(['Below: Root'], $this->subject->describe('under:1', []));
    }

    #[Test]
    public function fallsBackToTheUidForAPageThatIsNoLongerThere(): void
    {
        self::assertSame(['Below: 999'], $this->subject->describe('under:999', []));
    }

    #[Test]
    public function describesAnEmptyPhraseAsNoCriteriaAtAll(): void
    {
        self::assertSame([], $this->subject->describe('', [$this->pageStateTab()]));
    }

    #[Test]
    public function promotesTheSummaryToTheLabelOfAFavoriteSavedWithoutAName(): void
    {
        // FavoriteService stores the phrase as the label when none was typed.
        // Showing the raw phrase as a heading and its readable summary right
        // below would say the same thing twice, so the summary takes over the
        // heading and the criteria list is dropped.
        $favorites = $this->subject->describeFavorites(
            [['label' => 'is:hidden,empty', 'tokenString' => 'is:hidden,empty', 'createdAt' => 1700000000]],
            [$this->pageStateTab()],
        );

        self::assertSame('Page state: Hidden, Page state: Empty', $favorites[0]['label']);
        self::assertSame([], $favorites[0]['criteria']);
    }

    #[Test]
    public function keepsBothTheNameAndTheCriteriaForANamedFavorite(): void
    {
        $favorites = $this->subject->describeFavorites(
            [['label' => 'Needs review', 'tokenString' => 'is:hidden', 'createdAt' => 1700000000]],
            [$this->pageStateTab()],
        );

        self::assertSame('Needs review', $favorites[0]['label']);
        self::assertSame(['Page state: Hidden'], $favorites[0]['criteria']);
    }

    /**
     * @return array<string, mixed>
     */
    private function pageStateTab(): array
    {
        return [
            'identifier' => 'state',
            'label' => 'Page state',
            'configuration' => [
                'fields' => [
                    [
                        'type' => 'checkbox-group',
                        'name' => 'is',
                        // Single-field tabs name their field after the tab (see
                        // PageStateTab); the summary must not repeat that.
                        'label' => 'Page state',
                        'options' => [
                            ['value' => 'hidden', 'label' => 'Hidden'],
                            ['value' => 'empty', 'label' => 'Empty'],
                        ],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function activityTab(): array
    {
        $presets = [['value' => '<7d', 'label' => 'Within the last 7 days']];

        return [
            'identifier' => 'activity',
            'label' => 'Activity',
            'configuration' => [
                'fields' => [
                    ['type' => 'radio-presets', 'name' => 'updated', 'label' => 'Last updated', 'options' => $presets],
                    ['type' => 'radio-presets', 'name' => 'created', 'label' => 'Created', 'options' => $presets],
                ],
            ],
        ];
    }
}
