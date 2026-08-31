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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Tab;

use KonradMichalik\PagetreeFacets\Api\{FacetInterface, FilterContext};
use KonradMichalik\PagetreeFacets\Token\TokenParser;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Localization\LanguageServiceFactory;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

/**
 * AbstractTabTestCase.
 *
 * Base for tab functional tests: real database, real TCA, real DI container.
 * Each concrete test imports its own fixture set - exact-set assertions stay
 * readable because fixtures contain only what the tab under test looks at.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
abstract class AbstractTabTestCase extends FunctionalTestCase
{
    protected array $testExtensionsToLoad = [
        'konradmichalik/typo3-pagetree-facets',
    ];

    protected BackendUserAuthentication $backendUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/be_users.csv');
        $this->backendUser = $this->setUpBackendUser(1);
        $GLOBALS['LANG'] = $this->get(LanguageServiceFactory::class)->createFromUserPreferences($this->backendUser);
    }

    final protected function createContext(?string $siteIdentifier = null, ?BackendUserAuthentication $backendUser = null): FilterContext
    {
        return new FilterContext(
            $backendUser ?? $this->backendUser,
            0,
            $siteIdentifier,
        );
    }

    /**
     * Parses the token string, resolves the FIRST token through the facet and
     * returns the sorted page UID list.
     *
     * @return list<int>
     */
    final protected function resolve(FacetInterface $facet, string $tokenString): array
    {
        $tokens = (new TokenParser())->parse($tokenString);
        self::assertNotSame([], $tokens, 'Token string did not parse: '.$tokenString);
        $uids = $facet->resolvePageUids($tokens[0], $this->createContext());
        sort($uids);

        return $uids;
    }
}
