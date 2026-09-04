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

use Throwable;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

use function is_string;

/**
 * SessionFilterService.
 *
 * Optional per-session persistence of the current page tree filter phrase
 * (opt-in via the `persistFilter` extension setting). Stored in the BE user's
 * session data, so it survives a reload or module switch and is cleared on
 * logout. No schema, no migration.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class SessionFilterService
{
    private const SESSION_KEY = 'typo3_pagetree_facets_filter';

    // Bound on what a single BE user can persist into their session, mirroring
    // FavoriteService's token cap - generous enough for any realistic phrase.
    private const MAX_LENGTH = 2000;

    public function __construct(
        private ExtensionConfiguration $extensionConfiguration,
    ) {}

    public function isEnabled(): bool
    {
        try {
            return (bool) $this->extensionConfiguration->get('typo3_pagetree_facets', 'persistFilter');
        } catch (Throwable) {
            return false;
        }
    }

    public function get(BackendUserAuthentication $backendUser): string
    {
        $phrase = $backendUser->getSessionData(self::SESSION_KEY);

        return is_string($phrase) ? $phrase : '';
    }

    public function set(BackendUserAuthentication $backendUser, string $phrase): void
    {
        $backendUser->setAndSaveSessionData(self::SESSION_KEY, mb_substr($phrase, 0, self::MAX_LENGTH));
    }
}
