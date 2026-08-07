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

use KonradMichalik\PagetreeFacets\Service\FavoriteService;
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

/**
 * FavoriteServiceTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FavoriteServiceTest extends FunctionalTestCase
{
    protected array $testExtensionsToLoad = [
        'konradmichalik/typo3-pagetree-facets',
    ];

    private BackendUserAuthentication $backendUser;
    private FavoriteService $subject;

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/be_users.csv');
        $this->backendUser = $this->setUpBackendUser(1);
        $this->subject = $this->get(FavoriteService::class);
    }

    #[Test]
    public function addsAndListsFavorites(): void
    {
        $this->subject->addFavorite($this->backendUser, 'Empty pages', 'is:empty');
        $this->subject->addFavorite($this->backendUser, 'Old news pages', 'table:tx_news_domain_model_news updated:>1y');

        $favorites = $this->subject->getFavorites($this->backendUser);
        self::assertCount(2, $favorites);
        self::assertSame('Empty pages', $favorites[0]['label']);
        self::assertSame('is:empty', $favorites[0]['tokenString']);
    }

    #[Test]
    public function emptyLabelFallsBackToTokenString(): void
    {
        $this->subject->addFavorite($this->backendUser, '', 'is:hidden');

        self::assertSame('is:hidden', $this->subject->getFavorites($this->backendUser)[0]['label']);
    }

    #[Test]
    public function savingAPhraseThatIsAlreadySavedRenamesItInsteadOfAddingASecondEntry(): void
    {
        // Two rows with identical filters are indistinguishable once applied, so
        // the phrase is the identity - saving it again is a rename.
        $this->subject->addFavorite($this->backendUser, 'Empty pages', 'is:empty');
        $this->subject->addFavorite($this->backendUser, 'Pages without content', 'is:empty');

        $favorites = $this->subject->getFavorites($this->backendUser);
        self::assertCount(1, $favorites);
        self::assertSame('Pages without content', $favorites[0]['label']);
    }

    #[Test]
    public function aRenamedFavoriteKeepsItsPlaceAndCreationDate(): void
    {
        $this->subject->addFavorite($this->backendUser, 'First', 'is:empty');
        $createdAt = $this->subject->getFavorites($this->backendUser)[0]['createdAt'];
        $this->subject->addFavorite($this->backendUser, 'Second', 'is:hidden');

        $this->subject->addFavorite($this->backendUser, 'First renamed', 'is:empty');

        $favorites = $this->subject->getFavorites($this->backendUser);
        self::assertCount(2, $favorites);
        self::assertSame('First renamed', $favorites[0]['label']);
        self::assertSame('Second', $favorites[1]['label']);
        // Renaming does not make it a new favorite.
        self::assertSame($createdAt, $favorites[0]['createdAt']);
    }

    #[Test]
    public function removesFavoriteByIndexAndReindexes(): void
    {
        $this->subject->addFavorite($this->backendUser, 'First', 'is:empty');
        $this->subject->addFavorite($this->backendUser, 'Second', 'is:hidden');

        $this->subject->removeFavorite($this->backendUser, 0);

        $favorites = $this->subject->getFavorites($this->backendUser);
        self::assertCount(1, $favorites);
        self::assertSame('Second', $favorites[0]['label']);
    }

    #[Test]
    public function favoritesArePersistedInTheUserUc(): void
    {
        $this->subject->addFavorite($this->backendUser, 'Persisted', 'is:empty');

        // Reload the uc from the database - writeUC() must have persisted it.
        $freshUser = $this->setUpBackendUser(1);
        self::assertSame('Persisted', $this->subject->getFavorites($freshUser)[0]['label']);
    }

    #[Test]
    public function outOfRangeRemovalIsIgnored(): void
    {
        $this->subject->addFavorite($this->backendUser, 'Only', 'is:empty');
        $this->subject->removeFavorite($this->backendUser, 5);

        self::assertCount(1, $this->subject->getFavorites($this->backendUser));
    }

    #[Test]
    public function anEmptyTokenStringIsNotStored(): void
    {
        // A favorite is defined by its phrase - a label alone is meaningless.
        $this->subject->addFavorite($this->backendUser, 'Label only', '');

        self::assertSame([], $this->subject->getFavorites($this->backendUser));
    }

    #[Test]
    public function favoritesAreCappedToBoundUcGrowth(): void
    {
        for ($i = 0; $i < 55; ++$i) {
            $this->subject->addFavorite($this->backendUser, 'F'.$i, 'is:empty'.$i);
        }

        $favorites = $this->subject->getFavorites($this->backendUser);
        self::assertCount(50, $favorites);
        // Oldest five dropped, newest kept.
        self::assertSame('F5', $favorites[0]['label']);
        self::assertSame('F54', $favorites[49]['label']);
    }

    #[Test]
    public function overlongLabelAndTokenStringAreTruncated(): void
    {
        $this->subject->addFavorite($this->backendUser, str_repeat('a', 300), str_repeat('b', 2500));

        $favorite = $this->subject->getFavorites($this->backendUser)[0];
        self::assertSame(255, mb_strlen($favorite['label']));
        self::assertSame(2000, mb_strlen($favorite['tokenString']));
    }
}
