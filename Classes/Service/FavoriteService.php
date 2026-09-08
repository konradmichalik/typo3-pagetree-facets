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

use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;

use function array_slice;
use function count;
use function is_array;

/**
 * FavoriteService.
 *
 * Personal favorites: token strings persisted in the BE user uc. No schema,
 * no migration, robust against tab changes (unknown tokens are ignored on
 * hydrate). Shared team presets (own table + be_groups) are a v2 item.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FavoriteService
{
    private const UC_KEY = 'typo3_pagetree_facets';

    // Bounds on what a single BE user can persist into their own uc, so a
    // scripted client cannot bloat be_users.uc without limit. Generous enough
    // that no realistic manual use ever hits them.
    private const MAX_FAVORITES = 50;
    private const MAX_LABEL_LENGTH = 255;
    private const MAX_TOKEN_LENGTH = 2000;

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
        $tokenString = mb_substr($tokenString, 0, self::MAX_TOKEN_LENGTH);
        if ('' === $tokenString) {
            return; // nothing to favorite - a favorite is defined by its phrase
        }
        $label = mb_substr($label, 0, self::MAX_LABEL_LENGTH);
        $label = '' !== $label ? $label : $tokenString;

        $favorites = $this->getFavorites($backendUser);
        // A favorite is its phrase: two entries filtering identically are
        // indistinguishable in the list and produce the same tree, so saving a
        // phrase that is already saved renames that entry rather than adding a
        // twin. It keeps its place and its creation date - a new name does not
        // make it a new favorite.
        foreach ($favorites as $index => $favorite) {
            if ($favorite['tokenString'] === $tokenString) {
                $favorites[$index]['label'] = $label;
                $this->persist($backendUser, $favorites);

                return;
            }
        }
        $favorites[] = [
            'label' => $label,
            'tokenString' => $tokenString,
            'createdAt' => time(),
        ];
        // Keep only the most recent entries - drops the oldest once at the cap.
        if (count($favorites) > self::MAX_FAVORITES) {
            $favorites = array_slice($favorites, -self::MAX_FAVORITES);
        }
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
