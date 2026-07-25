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

namespace KonradMichalik\PagetreeLens\Service;

use KonradMichalik\PagetreeLens\Api\FilterTabInterface;
use KonradMichalik\PagetreeLens\Event\RegisterFilterTabsEvent;
use KonradMichalik\PagetreeLens\Token\Token;
use Psr\EventDispatcher\EventDispatcherInterface;
use Throwable;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

use function in_array;

/**
 * Collects tabs via RegisterFilterTabsEvent and applies the two configuration
 * layers: ext conf (global) and User TSconfig (per group/user). A disabled
 * tab's tokens become unknown -> ignored, so config cannot be bypassed by
 * typing tokens manually.
 */
final class TabRegistry
{
    /** @var list<FilterTabInterface>|null */
    private ?array $resolvedTabs = null;

    public function __construct(
        private readonly EventDispatcherInterface $eventDispatcher,
        private readonly ExtensionConfiguration $extensionConfiguration,
    ) {}

    /**
     * @return list<FilterTabInterface>
     */
    public function getTabs(BackendUserAuthentication $backendUser): array
    {
        if (null === $this->resolvedTabs) {
            $event = new RegisterFilterTabsEvent();
            $this->eventDispatcher->dispatch($event);
            $this->resolvedTabs = $event->getTabs();
        }

        $disabled = $this->getDisabledIdentifiers($backendUser);
        if ($this->isDisabledForUser($backendUser)) {
            return [];
        }

        return array_values(array_filter(
            $this->resolvedTabs,
            static fn (FilterTabInterface $tab): bool => !in_array($tab->getIdentifier(), $disabled, true),
        ));
    }

    public function findTabForToken(Token $token, BackendUserAuthentication $backendUser): ?FilterTabInterface
    {
        foreach ($this->getTabs($backendUser) as $tab) {
            if (in_array($token->key, $tab->getTokenKeys(), true)) {
                return $tab;
            }
        }

        return null;
    }

    public function isDisabledForUser(BackendUserAuthentication $backendUser): bool
    {
        if ((bool) ($backendUser->getTSConfig()['tx_pagetreelens.']['disable'] ?? false)) {
            return true;
        }
        $adminOnly = false;
        try {
            $adminOnly = (bool) $this->extensionConfiguration->get('pagetree_lens', 'adminOnly');
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
            $fromExtConf = (string) $this->extensionConfiguration->get('pagetree_lens', 'disabledTabs');
        } catch (Throwable) {
        }
        $fromTsConfig = (string) ($backendUser->getTSConfig()['tx_pagetreelens.']['disableTabs'] ?? '');

        return array_values(array_filter(array_map(
            trim(...),
            explode(',', $fromExtConf.','.$fromTsConfig),
        ), static fn (string $v): bool => '' !== $v));
    }
}
