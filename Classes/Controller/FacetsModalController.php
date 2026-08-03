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

namespace KonradMichalik\PagetreeFacets\Controller;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\{FavoriteService, TabRegistry};
use KonradMichalik\PagetreeFacets\Token\{Token, TokenParser, TokenSerializer};
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\{Connection, ConnectionPool};
use TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction;
use TYPO3\CMS\Core\Http\JsonResponse;
use TYPO3\CMS\Core\Localization\LanguageService;
use TYPO3\CMS\Core\Site\SiteFinder;

use function sprintf;

/**
 * FacetsModalController.
 *
 * AjaxRoutes endpoints backing the modal: declarative tab configuration
 * (incl. hydrated state from the current token string), site scope options
 * and favorite CRUD.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FacetsModalController
{
    public function __construct(
        private readonly TabRegistry $tabRegistry,
        private readonly TokenParser $tokenParser,
        private readonly TokenSerializer $tokenSerializer,
        private readonly FavoriteService $favoriteService,
        private readonly SiteFinder $siteFinder,
        private readonly ConnectionPool $connectionPool,
    ) {}

    public function configuration(ServerRequestInterface $request): JsonResponse
    {
        $backendUser = $this->getBackendUser();
        $tokens = $this->tokenParser->parse((string) ($request->getQueryParams()['phrase'] ?? ''));
        $siteIdentifier = $this->extractSiteScope($tokens);

        $context = new FilterContext(
            backendUser: $backendUser,
            workspaceId: $backendUser->workspace,
            siteIdentifier: $siteIdentifier,
        );

        return new JsonResponse([
            'tabs' => $this->buildTabs($context, $tokens),
            'sites' => $this->buildSiteOptions($backendUser),
            'activeSite' => $siteIdentifier,
            // "under:<uid>" scope, set from the modal's "current page and its
            // subpages" toggle - null when no such scope is active.
            'pageScope' => $this->extractPageScope($tokens),
            'freetext' => $this->extractFreetext($tokens),
            'favorites' => $this->favoriteService->getFavorites($backendUser),
        ]);
    }

    public function serialize(ServerRequestInterface $request): JsonResponse
    {
        $backendUser = $this->getBackendUser();
        $body = (array) ($request->getParsedBody() ?? []);
        $states = (array) ($body['states'] ?? []);
        $siteIdentifier = (string) ($body['site'] ?? '');
        $pageScope = (int) ($body['pageScope'] ?? 0);
        $freetext = trim((string) ($body['freetext'] ?? ''));

        $tokens = [];
        foreach ($this->tabRegistry->getTabs($backendUser) as $tab) {
            $state = (array) ($states[$tab->getIdentifier()] ?? []);
            if ([] !== $state) {
                $tokens = array_merge($tokens, $tab->serialize($state));
            }
        }
        if ('' !== $siteIdentifier) {
            $tokens[] = new Token('site', [$siteIdentifier], 'site:'.$siteIdentifier);
        }
        if ($pageScope > 0) {
            $tokens[] = new Token('under', [(string) $pageScope], 'under:'.$pageScope);
        }
        if ('' !== $freetext) {
            $tokens[] = new Token(
                Token::FREETEXT,
                [$freetext],
                $freetext,
            );
        }

        return new JsonResponse(['phrase' => $this->tokenSerializer->serialize($tokens)]);
    }

    public function addFavorite(ServerRequestInterface $request): JsonResponse
    {
        $body = (array) ($request->getParsedBody() ?? []);
        $this->favoriteService->addFavorite(
            $this->getBackendUser(),
            trim((string) ($body['label'] ?? '')),
            trim((string) ($body['tokenString'] ?? '')),
        );

        return new JsonResponse(['favorites' => $this->favoriteService->getFavorites($this->getBackendUser())]);
    }

    public function removeFavorite(ServerRequestInterface $request): JsonResponse
    {
        $body = (array) ($request->getParsedBody() ?? []);
        $this->favoriteService->removeFavorite($this->getBackendUser(), (int) ($body['index'] ?? -1));

        return new JsonResponse(['favorites' => $this->favoriteService->getFavorites($this->getBackendUser())]);
    }

    /**
     * Backs the Activity tab's "Edited by" typeahead: either an exact uid
     * lookup (re-resolving a hydrated filter to a display label) or a LIKE
     * search across username/realName. Never both in the same request - uid
     * takes precedence so a stale query string cannot widen an exact lookup.
     */
    public function users(ServerRequestInterface $request): JsonResponse
    {
        $queryParams = $request->getQueryParams();
        $uid = (int) ($queryParams['uid'] ?? 0);
        $search = trim((string) ($queryParams['q'] ?? ''));

        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('be_users');
        $queryBuilder->getRestrictions()->removeAll()->add(new DeletedRestriction());
        $queryBuilder
            ->select('uid', 'username', 'realName')
            ->from('be_users')
            ->orderBy('username')
            ->setMaxResults(20);

        if ($uid > 0) {
            $queryBuilder->andWhere($queryBuilder->expr()->eq('uid', $queryBuilder->createNamedParameter($uid, Connection::PARAM_INT)));
        } elseif ('' !== $search) {
            $wildcard = '%'.$queryBuilder->escapeLikeWildcards($search).'%';
            $queryBuilder->andWhere($queryBuilder->expr()->or(
                $queryBuilder->expr()->like('username', $queryBuilder->createNamedParameter($wildcard)),
                $queryBuilder->expr()->like('realName', $queryBuilder->createNamedParameter($wildcard)),
            ));
        } else {
            return new JsonResponse(['users' => []]);
        }

        return new JsonResponse(['users' => array_map(
            static fn (array $row): array => [
                'uid' => (int) $row['uid'],
                'label' => '' !== $row['realName'] ? sprintf('%s (%s)', $row['realName'], $row['username']) : $row['username'],
            ],
            $queryBuilder->executeQuery()->fetchAllAssociative(),
        )]);
    }

    /**
     * @param list<Token> $tokens
     *
     * @return list<array<string, mixed>>
     */
    private function buildTabs(FilterContext $context, array $tokens): array
    {
        $languageService = $this->getLanguageService();
        $tabs = [];
        foreach ($this->tabRegistry->getTabs($context->backendUser) as $tab) {
            $tabs[] = [
                'identifier' => $tab->getIdentifier(),
                'label' => $this->translate($languageService, $tab->getLabel()),
                'group' => $tab->getGroup(),
                'configuration' => $this->translateConfiguration($tab->getModalConfiguration($context)),
                'state' => $tab->hydrate($tokens),
            ];
        }

        return $tabs;
    }

    /**
     * @param array{fields: list<array<string, mixed>>} $configuration
     *
     * @return array{fields: list<array<string, mixed>>}
     */
    private function translateConfiguration(array $configuration): array
    {
        $languageService = $this->getLanguageService();
        foreach ($configuration['fields'] as $fieldIndex => $field) {
            $configuration['fields'][$fieldIndex]['label'] = $this->translate($languageService, (string) ($field['label'] ?? ''));
            foreach ($field['options'] ?? [] as $optionIndex => $option) {
                $configuration['fields'][$fieldIndex]['options'][$optionIndex]['label']
                    = $this->translate($languageService, (string) ($option['label'] ?? ''));
                if ('' !== (string) ($option['description'] ?? '')) {
                    $configuration['fields'][$fieldIndex]['options'][$optionIndex]['description']
                        = $this->translate($languageService, (string) $option['description']);
                }
            }
        }

        return $configuration;
    }

    /**
     * Site dropdown options, restricted to the user's mounts; the modal hides
     * the dropdown when only one site is accessible.
     *
     * @return list<array{identifier: string, rootPageId: int}>
     */
    private function buildSiteOptions(BackendUserAuthentication $backendUser): array
    {
        $sites = [];
        foreach ($this->siteFinder->getAllSites() as $site) {
            $rootPageId = $site->getRootPageId();
            if (!$backendUser->isAdmin() && null === $backendUser->isInWebMount($rootPageId)) {
                continue;
            }
            $sites[] = ['identifier' => $site->getIdentifier(), 'rootPageId' => $rootPageId];
        }

        return $sites;
    }

    /**
     * @param list<Token> $tokens
     */
    private function extractSiteScope(array $tokens): ?string
    {
        foreach ($tokens as $token) {
            if ('site' === $token->key) {
                return $token->firstValue();
            }
        }

        return null;
    }

    /**
     * @param list<Token> $tokens
     */
    private function extractPageScope(array $tokens): ?int
    {
        foreach ($tokens as $token) {
            if ('under' === $token->key) {
                $uid = (int) $token->firstValue();

                return $uid > 0 ? $uid : null;
            }
        }

        return null;
    }

    /**
     * @param list<Token> $tokens
     */
    private function extractFreetext(array $tokens): string
    {
        foreach ($tokens as $token) {
            if ($token->isFreetext()) {
                return $token->firstValue();
            }
        }

        return '';
    }

    private function translate(LanguageService $languageService, string $label): string
    {
        // sL() resolves both the classic LLL: syntax and the v14 label-identifier
        // shorthand (e.g. "core.db.pages:doktype.default" used by the doktype TCA
        // items); it returns non-identifier strings unchanged, so no LLL: guard.
        return '' === $label ? $label : ($languageService->sL($label) ?: $label);
    }

    private function getBackendUser(): BackendUserAuthentication
    {
        return $GLOBALS['BE_USER'];
    }

    private function getLanguageService(): LanguageService
    {
        return $GLOBALS['LANG'];
    }
}
