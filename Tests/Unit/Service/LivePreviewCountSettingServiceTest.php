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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Service;

use KonradMichalik\PagetreeFacets\Service\LivePreviewCountSettingService;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Configuration\Exception\ExtensionConfigurationPathDoesNotExistException;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

/**
 * LivePreviewCountSettingServiceTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class LivePreviewCountSettingServiceTest extends TestCase
{
    #[Test]
    public function isEnabledReflectsTheExtensionSetting(): void
    {
        self::assertTrue($this->createService('1')->isEnabled());
        self::assertFalse($this->createService('0')->isEnabled());
    }

    #[Test]
    public function isEnabledDefaultsToTrueWhenTheSettingWasNeverWritten(): void
    {
        // Upgrade safety: an instance that predates this setting must not
        // silently lose the feature just because the key was never persisted.
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willThrowException(
            new ExtensionConfigurationPathDoesNotExistException('not configured', 1755000100),
        );

        self::assertTrue((new LivePreviewCountSettingService($extensionConfiguration))->isEnabled());
    }

    private function createService(string $livePreviewCount): LivePreviewCountSettingService
    {
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willReturn($livePreviewCount);

        return new LivePreviewCountSettingService($extensionConfiguration);
    }
}
