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

use KonradMichalik\PagetreeFacets\Api\FilterOptionInterface;
use KonradMichalik\PagetreeFacets\Event\RegisterFilterOptionsEvent;
use Psr\EventDispatcher\EventDispatcherInterface;
use Throwable;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

use function in_array;

/**
 * OptionRegistry.
 *
 * Collects filter options via RegisterFilterOptionsEvent (once, cached) and
 * applies the per-option disable layer: ext conf "disabledOptions" (global)
 * and User TSconfig "tx_typo3pagetreefacets.disableOptions" (per group/user),
 * identified as "tokenKey:value". The sibling of FacetRegistry.
 *
 * A disabled option disappears from both the modal (its checkbox is not merged
 * in) and resolution (the owning facet consults this registry for unknown
 * values), so config cannot be bypassed by typing the token manually. The
 * feature-level and facet-level gates are enforced upstream by FacetRegistry - an
 * option is only ever reached through a facet that survived that filtering.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class OptionRegistry
{
    /** @var list<FilterOptionInterface>|null */
    private ?array $resolvedOptions = null;

    public function __construct(
        private readonly EventDispatcherInterface $eventDispatcher,
        private readonly ExtensionConfiguration $extensionConfiguration,
    ) {}

    /**
     * All enabled options contributed for a single token key, in registration
     * priority order.
     *
     * @return list<FilterOptionInterface>
     */
    public function getOptions(string $tokenKey, BackendUserAuthentication $backendUser): array
    {
        if (null === $this->resolvedOptions) {
            $event = new RegisterFilterOptionsEvent();
            $this->eventDispatcher->dispatch($event);
            $this->resolvedOptions = $event->getOptions();
        }

        $disabled = $this->getDisabledIdentifiers($backendUser);

        return array_values(array_filter(
            $this->resolvedOptions,
            static fn (FilterOptionInterface $option): bool => $option->getTokenKey() === $tokenKey
                && !in_array($option->getTokenKey().':'.$option->getValue(), $disabled, true),
        ));
    }

    public function findOption(string $tokenKey, string $value, BackendUserAuthentication $backendUser): ?FilterOptionInterface
    {
        foreach ($this->getOptions($tokenKey, $backendUser) as $option) {
            if ($option->getValue() === $value) {
                return $option;
            }
        }

        return null;
    }

    /**
     * @return list<string> disabled "tokenKey:value" identifiers
     */
    private function getDisabledIdentifiers(BackendUserAuthentication $backendUser): array
    {
        $fromExtConf = '';
        try {
            $fromExtConf = (string) $this->extensionConfiguration->get('typo3_pagetree_facets', 'disabledOptions');
        } catch (Throwable) {
        }
        $fromTsConfig = (string) ($backendUser->getTSConfig()['tx_typo3pagetreefacets.']['disableOptions'] ?? '');

        return array_values(array_filter(array_map(
            trim(...),
            explode(',', $fromExtConf.','.$fromTsConfig),
        ), static fn (string $v): bool => '' !== $v));
    }
}
