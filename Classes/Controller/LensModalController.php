<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_lens" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeLens\Controller;

use KonradMichalik\PagetreeLens\Api\FilterContext;
use KonradMichalik\PagetreeLens\Service\{FavoriteService, TabRegistry};
use KonradMichalik\PagetreeLens\Token\{TokenParser, TokenSerializer};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Http\JsonResponse;
use TYPO3\CMS\Core\Localization\LanguageService;
use TYPO3\CMS\Core\Site\SiteFinder;

/**
 * AjaxRoutes endpoints backing the modal: declarative tab configuration
 * (incl. hydrated state from the current token string), site scope options
 * and favorite CRUD.
 */
final class LensModalController
{
    public function __construct(
        private readonly TabRegistry $tabRegistry,
        private readonly TokenParser $tokenParser,
        private readonly TokenSerializer $tokenSerializer,
        private readonly FavoriteService $favoriteService,
        private readonly SiteFinder $siteFinder,
    ) {}

    public function configuration(ServerRequestInterface $request): ResponseInterface
    {
        $backendUser = $this->getBackendUser();
        $phrase = (string) ($request->getQueryParams()['phrase'] ?? '');
        $tokens = $this->tokenParser->parse($phrase);

        $siteIdentifier = null;
        $freetext = '';
        foreach ($tokens as $token) {
            if ('site' === $token->key) {
                $siteIdentifier = $token->firstValue();
            }
            if ($token->isFreetext()) {
                $freetext = $token->firstValue();
            }
        }
        $context = new FilterContext(
            backendUser: $backendUser,
            workspaceId: (int) $backendUser->workspace,
            siteIdentifier: $siteIdentifier,
        );

        $languageService = $this->getLanguageService();
        $tabs = [];
        foreach ($this->tabRegistry->getTabs($backendUser) as $tab) {
            $configuration = $tab->getModalConfiguration($context);
            foreach ($configuration['fields'] ?? [] as $fieldIndex => $field) {
                $configuration['fields'][$fieldIndex]['label'] = $this->translate($languageService, (string) ($field['label'] ?? ''));
                foreach ($field['options'] ?? [] as $optionIndex => $option) {
                    $configuration['fields'][$fieldIndex]['options'][$optionIndex]['label']
                        = $this->translate($languageService, (string) ($option['label'] ?? ''));
                }
            }
            $tabs[] = [
                'identifier' => $tab->getIdentifier(),
                'label' => $this->translate($languageService, $tab->getLabel()),
                'group' => $tab->getGroup(),
                'configuration' => $configuration,
                'state' => $tab->hydrate($tokens),
            ];
        }

        // Site dropdown options, restricted to the user's mounts; the modal
        // hides the dropdown when only one site is accessible.
        $sites = [];
        foreach ($this->siteFinder->getAllSites() as $site) {
            $rootPageId = $site->getRootPageId();
            if (!$backendUser->isAdmin() && !$backendUser->isInWebMount($rootPageId)) {
                continue;
            }
            $sites[] = ['identifier' => $site->getIdentifier(), 'rootPageId' => $rootPageId];
        }

        return new JsonResponse([
            'tabs' => $tabs,
            'sites' => $sites,
            'activeSite' => $siteIdentifier,
            'freetext' => $freetext,
            'favorites' => $this->favoriteService->getFavorites($backendUser),
        ]);
    }

    public function serialize(ServerRequestInterface $request): ResponseInterface
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
            $tokens[] = new \KonradMichalik\PagetreeLens\Token\Token('site', [$siteIdentifier], 'site:'.$siteIdentifier);
        }
        if ('' !== $freetext) {
            $tokens[] = new \KonradMichalik\PagetreeLens\Token\Token(
                \KonradMichalik\PagetreeLens\Token\Token::FREETEXT,
                [$freetext],
                $freetext,
            );
        }

        return new JsonResponse(['phrase' => $this->tokenSerializer->serialize($tokens)]);
    }

    public function addFavorite(ServerRequestInterface $request): ResponseInterface
    {
        $body = (array) ($request->getParsedBody() ?? []);
        $this->favoriteService->addFavorite(
            $this->getBackendUser(),
            trim((string) ($body['label'] ?? '')),
            trim((string) ($body['tokenString'] ?? '')),
        );

        return new JsonResponse(['favorites' => $this->favoriteService->getFavorites($this->getBackendUser())]);
    }

    public function removeFavorite(ServerRequestInterface $request): ResponseInterface
    {
        $body = (array) ($request->getParsedBody() ?? []);
        $this->favoriteService->removeFavorite($this->getBackendUser(), (int) ($body['index'] ?? -1));

        return new JsonResponse(['favorites' => $this->favoriteService->getFavorites($this->getBackendUser())]);
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
