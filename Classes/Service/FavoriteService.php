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

use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;

use function is_array;

/**
 * Personal favorites: token strings persisted in the BE user uc. No schema,
 * no migration, robust against tab changes (unknown tokens are ignored on
 * hydrate). Shared team presets (own table + be_groups) are a v2 item.
 */
final class FavoriteService
{
    private const string UC_KEY = 'pagetree_lens';

    /**
     * @return list<array{label: string, tokenString: string, createdAt: int}>
     */
    public function getFavorites(BackendUserAuthentication $backendUser): array
    {
        $favorites = $backendUser->uc[self::UC_KEY]['favorites'] ?? [];

        return is_array($favorites) ? array_values($favorites) : [];
    }

    public function addFavorite(BackendUserAuthentication $backendUser, string $label, string $tokenString): void
    {
        $favorites = $this->getFavorites($backendUser);
        $favorites[] = [
            'label' => '' !== $label ? $label : $tokenString,
            'tokenString' => $tokenString,
            'createdAt' => time(),
        ];
        $this->persist($backendUser, $favorites);
    }

    public function removeFavorite(BackendUserAuthentication $backendUser, int $index): void
    {
        $favorites = $this->getFavorites($backendUser);
        unset($favorites[$index]);
        $this->persist($backendUser, array_values($favorites));
    }

    /**
     * @param list<array{label: string, tokenString: string, createdAt: int}> $favorites
     */
    private function persist(BackendUserAuthentication $backendUser, array $favorites): void
    {
        $backendUser->uc[self::UC_KEY]['favorites'] = $favorites;
        $backendUser->writeUC();
    }
}
