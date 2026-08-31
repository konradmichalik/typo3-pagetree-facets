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

namespace KonradMichalik\PagetreeFacets\Controller;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\{FacetRegistry, FavoriteService, FilterResolutionService, LivePreviewCountSettingService, PhraseSummaryService, SessionFilterService};
use KonradMichalik\PagetreeFacets\Token\{ModalStateTokenBuilder, Token, TokenParser, TokenSerializer};
use Psr\Http\Message\ServerRequestInterface;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\{Connection, ConnectionPool};
use TYPO3\CMS\Core\Database\Query\Restriction\DeletedRestriction;
use TYPO3\CMS\Core\Http\{JsonResponse, PropagateResponseException};
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
final readonly class FacetsModalController
{
    public function __construct(
        private FacetRegistry $facetRegistry,
        private TokenParser $tokenParser,
        private TokenSerializer $tokenSerializer,
        private FavoriteService $favoriteService,
        private PhraseSummaryService $phraseSummaryService,
        private SessionFilterService $sessionFilterService,
        private SiteFinder $siteFinder,
        private ConnectionPool $connectionPool,
        private FilterResolutionService $filterResolutionService,
        private LivePreviewCountSettingService $livePreviewCountSetting,
        private ModalStateTokenBuilder $modalStateTokenBuilder,
    ) {}

    public function configuration(ServerRequestInterface $request): JsonResponse
    {
        $backendUser = $this->requireEnabledUser();
        $tokens = $this->tokenParser->parse((string) ($request->getQueryParams()['phrase'] ?? ''));
        $siteIdentifier = $this->extractSiteScope($tokens);

        $context = new FilterContext(
            $backendUser,
            $backendUser->workspace,
            $siteIdentifier,
        );

        $tabs = $this->buildTabs($context, $tokens);

        return new JsonResponse([
            'tabs' => $tabs,
            'sites' => $this->buildSiteOptions($backendUser),
            'activeSite' => $siteIdentifier,
            // "under:<uid>" scope, set from the modal's "current page and its
            // subpages" toggle - null when no such scope is active.
            'pageScope' => $this->extractPageScope($tokens),
            'freetext' => $this->extractFreetext($tokens),
            // Saved phrases are listed by what they filter for, not by their
            // syntax. Resolved against the tab vocabulary just built above, so
            // no tab is asked for its options twice.
            'favorites' => $this->phraseSummaryService->describeFavorites(
                $this->favoriteService->getFavorites($backendUser),
                $tabs,
            ),
        ]);
    }

    public function serialize(ServerRequestInterface $request): JsonResponse
    {
        $backendUser = $this->requireEnabledUser();
        $tokens = $this->modalStateTokenBuilder->build((array) ($request->getParsedBody() ?? []), $backendUser);

        return new JsonResponse(['phrase' => $this->tokenSerializer->serialize($tokens)]);
    }

    /**
     * Live, debounced match count for the modal footer (see FilterResolutionService
     * for the shared resolve pipeline). Bails out to a null count - rather than a
     * 403 - when the feature is switched off: this is a convenience toggle, not an
     * access boundary, so a stale client hitting this endpoint after an admin
     * disabled it should see no number, not an error.
     */
    public function count(ServerRequestInterface $request): JsonResponse
    {
        $backendUser = $this->requireEnabledUser();
        if (!$this->livePreviewCountSetting->isEnabled()) {
            return new JsonResponse(['count' => null]);
        }

        $body = (array) ($request->getParsedBody() ?? []);
        $tokens = $this->modalStateTokenBuilder->build($body, $backendUser);
        $siteIdentifier = trim((string) ($body['site'] ?? ''));
        $context = new FilterContext(
            $backendUser,
            $backendUser->workspace,
            '' !== $siteIdentifier ? $siteIdentifier : null,
        );

        return new JsonResponse(['count' => $this->filterResolutionService->count($tokens, $context)]);
    }

    public function addFavorite(ServerRequestInterface $request): JsonResponse
    {
        $backendUser = $this->requireEnabledUser();
        $body = (array) ($request->getParsedBody() ?? []);
        $this->favoriteService->addFavorite(
            $backendUser,
            trim((string) ($body['label'] ?? '')),
            trim((string) ($body['tokenString'] ?? '')),
        );

        return new JsonResponse(['favorites' => $this->describedFavorites($backendUser)]);
    }

    public function removeFavorite(ServerRequestInterface $request): JsonResponse
    {
        $backendUser = $this->requireEnabledUser();
        $body = (array) ($request->getParsedBody() ?? []);
        $this->favoriteService->removeFavorite($backendUser, (int) ($body['index'] ?? -1));

        return new JsonResponse(['favorites' => $this->describedFavorites($backendUser)]);
    }

    /**
     * Store the current tree filter phrase in the session so it survives a
     * reload (opt-in via the persistFilter setting). A no-op when the setting
     * is off, so a stale client cannot write session data behind the setting.
     */
    public function persist(ServerRequestInterface $request): JsonResponse
    {
        $backendUser = $this->requireEnabledUser();
        if ($this->sessionFilterService->isEnabled()) {
            $body = (array) ($request->getParsedBody() ?? []);
            $this->sessionFilterService->set($backendUser, trim((string) ($body['phrase'] ?? '')));
        }

        return new JsonResponse(['ok' => true]);
    }

    /**
     * Backs the Activity tab's "Edited by" typeahead: either an exact uid
     * lookup (re-resolving a hydrated filter to a display label) or a LIKE
     * search across username/realName. Never both in the same request - uid
     * takes precedence so a stale query string cannot widen an exact lookup.
     */
    public function users(ServerRequestInterface $request): JsonResponse
    {
        $backendUser = $this->getBackendUser();
        // Same access boundary as the rest of the feature: a user for whom the
        // feature is switched off - or who has no tab owning the "by" key (the
        // Activity tab this endpoint backs is disabled) - must not be able to
        // enumerate be_users through the raw endpoint. The UI never loads for
        // them anyway; this closes the direct-request bypass.
        // The tables_select check additionally binds the endpoint to TYPO3's own
        // be_users listing permission (admins always pass): filtering by editor
        // is a page-tree concern, but *which accounts exist* is be_users data -
        // without the grant, any editor could enumerate all account names here.
        if ($this->facetRegistry->isDisabledForUser($backendUser)
            || null === $this->facetRegistry->findFacetForToken(new Token('by', ['0'], 'by:0'), $backendUser)
            || !$backendUser->check('tables_select', 'be_users')
        ) {
            return new JsonResponse(['users' => []]);
        }

        $queryParams = $request->getQueryParams();
        $uid = (int) ($queryParams['uid'] ?? 0);
        $search = trim((string) ($queryParams['q'] ?? ''));

        $queryBuilder = $this->connectionPool->getQueryBuilderForTable('be_users');
        // Only deleted users are excluded, not disabled ones: the picker filters
        // pages by who edited/created them, and a now-disabled account can still
        // be the author of pages that must stay findable - so it stays offered.
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
     * The favorite list as the modal renders it, descriptions included. The CRUD
     * endpoints answer with the complete list and the client adopts it as it
     * stands, so they have to describe it too - returning the bare records there
     * blanked every description out until the modal was reopened.
     *
     * Unscoped on purpose: a favorite may name a site other than the one the
     * modal is currently scoped to, and the full vocabulary resolves more of
     * them. Building the tabs costs a modal configuration, which is fair for a
     * deliberate save or delete.
     *
     * @return list<array<string, mixed>>
     */
    private function describedFavorites(BackendUserAuthentication $backendUser): array
    {
        $context = new FilterContext(
            $backendUser,
            $backendUser->workspace,
            null,
        );

        return $this->phraseSummaryService->describeFavorites(
            $this->favoriteService->getFavorites($backendUser),
            $this->buildTabs($context, []),
        );
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
        foreach ($this->facetRegistry->getFacets($context->backendUser) as $facet) {
            $tabs[] = [
                'identifier' => $facet->getIdentifier(),
                'label' => $this->translate($languageService, $facet->getLabel()),
                'group' => null !== $facet->getGroup() ? $this->translate($languageService, $facet->getGroup()) : null,
                'configuration' => $this->translateConfiguration($facet->getModalConfiguration($context)),
                'state' => $facet->hydrate($tokens),
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
            $configuration['fields'][$fieldIndex] = $this->translateField($languageService, $field);
        }

        return $configuration;
    }

    /**
     * @param array<string, mixed> $field
     *
     * @return array<string, mixed>
     */
    private function translateField(LanguageService $languageService, array $field): array
    {
        $field['label'] = $this->translate($languageService, (string) ($field['label'] ?? ''));
        if ('' !== (string) ($field['placeholder'] ?? '')) {
            $field['placeholder'] = $this->translate($languageService, (string) $field['placeholder']);
        }
        foreach ($field['options'] ?? [] as $optionIndex => $option) {
            $field['options'][$optionIndex]['label'] = $this->translate($languageService, (string) ($option['label'] ?? ''));
            if ('' !== (string) ($option['description'] ?? '')) {
                $field['options'][$optionIndex]['description'] = $this->translate($languageService, (string) $option['description']);
            }
        }

        return $field;
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

    private function forbidden(): JsonResponse
    {
        return new JsonResponse(['error' => 'The page tree filter feature is disabled for this user.'], 403);
    }

    /**
     * Shared access boundary for the modal endpoints: returns the backend user,
     * or short-circuits the request with a 403 (caught by the ResponsePropagation
     * middleware) when the feature is disabled for them.
     */
    private function requireEnabledUser(): BackendUserAuthentication
    {
        $backendUser = $this->getBackendUser();
        if ($this->facetRegistry->isDisabledForUser($backendUser)) {
            throw new PropagateResponseException($this->forbidden(), 1785888000);
        }

        return $backendUser;
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
