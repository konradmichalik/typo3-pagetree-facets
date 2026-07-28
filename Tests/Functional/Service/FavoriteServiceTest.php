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
}
