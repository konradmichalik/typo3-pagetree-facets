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

use KonradMichalik\PagetreeFacets\Service\SessionFilterService;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\Exception\ExtensionConfigurationPathDoesNotExistException;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

/**
 * SessionFilterServiceTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class SessionFilterServiceTest extends TestCase
{
    #[Test]
    public function isEnabledReflectsTheExtensionSetting(): void
    {
        self::assertTrue($this->createService('1')->isEnabled());
        self::assertFalse($this->createService('0')->isEnabled());
    }

    #[Test]
    public function isEnabledIsFalseWhenTheSettingWasNeverSaved(): void
    {
        // get() throws before the extension has ever been saved through the
        // Settings module - that must read as "off", not propagate.
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willThrowException(
            new ExtensionConfigurationPathDoesNotExistException('not configured', 1668941190),
        );

        self::assertFalse((new SessionFilterService($extensionConfiguration))->isEnabled());
    }

    #[Test]
    public function getReturnsTheStoredPhrase(): void
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getSessionData')->willReturn('doktype:1 is:empty');

        self::assertSame('doktype:1 is:empty', $this->createService('1')->get($backendUser));
    }

    #[Test]
    public function getReturnsEmptyStringWhenNothingIsStored(): void
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getSessionData')->willReturn(null);

        self::assertSame('', $this->createService('1')->get($backendUser));
    }

    #[Test]
    public function setPersistsThePhraseInTheSession(): void
    {
        $backendUser = $this->createMock(BackendUserAuthentication::class);
        $backendUser->expects(self::once())
            ->method('setAndSaveSessionData')
            ->with('typo3_pagetree_facets_filter', 'doktype:1');

        $this->createService('1')->set($backendUser, 'doktype:1');
    }

    private function createService(string $persistFilter): SessionFilterService
    {
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willReturn($persistFilter);

        return new SessionFilterService($extensionConfiguration);
    }
}
