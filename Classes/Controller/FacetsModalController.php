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
use TYPO3\CMS\Core\Http\JsonResponse;
use TYPO3\CMS\Core\Localization\LanguageService;
use TYPO3\CMS\Core\Site\SiteFinder;

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
        return str_starts_with($label, 'LLL:') ? ($languageService->sL($label) ?: $label) : $label;
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
