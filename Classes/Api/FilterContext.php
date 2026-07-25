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

namespace KonradMichalik\PagetreeLens\Api;

use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;

/**
 * Context passed to every tab when resolving page UIDs.
 *
 * Deliberately carries no hard "pages" assumption in its name or shape -
 * a possible future tree scope (see docs/ROADMAP.md) would extend this.
 */
final readonly class FilterContext
{
    public function __construct(
        public BackendUserAuthentication $backendUser,
        public int $workspaceId,
        /** Site identifier from a "site:" scope token, or null = all accessible sites */
        public ?string $siteIdentifier = null,
    ) {}
}
