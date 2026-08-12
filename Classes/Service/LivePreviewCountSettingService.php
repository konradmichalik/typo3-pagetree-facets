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
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

/**
 * LivePreviewCountSettingService.
 *
 * Whether the modal's live match-count preview is switched on
 * (`livePreviewCount` extension setting, default on). Its own class rather
 * than a private method on FacetsModalController: that controller's
 * class-level cognitive complexity was at PHPStan's ceiling, and this
 * check - a single try/catch reading one ext_conf key - is exactly the kind
 * of self-contained unit that can move out without disturbing anything it
 * was part of. BackendAssetsListener keeps its own separate copy of this
 * same check (isLivePreviewCountEnabled()) for the frontend-facing inline
 * setting - not merged with this one just because the shape matches; that
 * would be reaching for DRY before a real third occurrence justifies it.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class LivePreviewCountSettingService
{
    public function __construct(
        private ExtensionConfiguration $extensionConfiguration,
    ) {}

    public function isEnabled(): bool
    {
        try {
            return (bool) $this->extensionConfiguration->get('typo3_pagetree_facets', 'livePreviewCount');
        } catch (Throwable) {
            return true;
        }
    }
}
