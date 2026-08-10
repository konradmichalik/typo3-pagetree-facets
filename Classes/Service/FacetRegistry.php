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

namespace KonradMichalik\PagetreeFacets\Service;

use KonradMichalik\PagetreeFacets\Api\FacetInterface;
use KonradMichalik\PagetreeFacets\Event\RegisterFacetsEvent;
use KonradMichalik\PagetreeFacets\Token\Token;
use Psr\EventDispatcher\EventDispatcherInterface;
use Throwable;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

use function in_array;

/**
 * FacetRegistry.
 *
 * Collects facets via RegisterFacetsEvent and applies the two configuration
 * layers: ext conf (global) and User TSconfig (per group/user). A disabled
 * facet's tokens become unknown -> ignored, so config cannot be bypassed by
 * typing tokens manually.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FacetRegistry
{
    /** @var list<FacetInterface>|null */
    private ?array $resolvedFacets = null;

    public function __construct(
        private readonly EventDispatcherInterface $eventDispatcher,
        private readonly ExtensionConfiguration $extensionConfiguration,
    ) {}

    /**
     * @return list<FacetInterface>
     */
    public function getFacets(BackendUserAuthentication $backendUser): array
    {
        if (null === $this->resolvedFacets) {
            $event = new RegisterFacetsEvent();
            $this->eventDispatcher->dispatch($event);
            $this->resolvedFacets = $event->getFacets();
        }

        $disabled = $this->getDisabledIdentifiers($backendUser);
        if ($this->isDisabledForUser($backendUser)) {
            return [];
        }

        return array_values(array_filter(
            $this->resolvedFacets,
            static fn (FacetInterface $facet): bool => !in_array($facet->getIdentifier(), $disabled, true),
        ));
    }

    public function findFacetForToken(Token $token, BackendUserAuthentication $backendUser): ?FacetInterface
    {
        foreach ($this->getFacets($backendUser) as $facet) {
            if (in_array($token->key, $facet->getTokenKeys(), true)) {
                return $facet;
            }
        }

        return null;
    }

    public function isDisabledForUser(BackendUserAuthentication $backendUser): bool
    {
        if ((bool) ($backendUser->getTSConfig()['tx_typo3pagetreefacets.']['disable'] ?? false)) {
            return true;
        }
        $adminOnly = false;
        try {
            $adminOnly = (bool) $this->extensionConfiguration->get('typo3_pagetree_facets', 'adminOnly');
        } catch (Throwable) {
        }

        return $adminOnly && !$backendUser->isAdmin();
    }

    /**
     * @return list<string>
     */
    private function getDisabledIdentifiers(BackendUserAuthentication $backendUser): array
    {
        $fromExtConf = '';
        try {
            $fromExtConf = (string) $this->extensionConfiguration->get('typo3_pagetree_facets', 'disabledFacets');
        } catch (Throwable) {
        }
        $fromTsConfig = (string) ($backendUser->getTSConfig()['tx_typo3pagetreefacets.']['disableFacets'] ?? '');

        return array_values(array_filter(array_map(
            trim(...),
            explode(',', $fromExtConf.','.$fromTsConfig),
        ), static fn (string $v): bool => '' !== $v));
    }
}
