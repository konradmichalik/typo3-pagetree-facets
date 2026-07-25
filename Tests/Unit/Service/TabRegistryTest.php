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

namespace KonradMichalik\PagetreeLens\Tests\Unit\Service;

use KonradMichalik\PagetreeLens\Api\FilterTabInterface;
use KonradMichalik\PagetreeLens\Service\TabRegistry;
use KonradMichalik\PagetreeLens\Tests\Unit\Fixture\CollectingEventDispatcher;
use KonradMichalik\PagetreeLens\Tests\Unit\Fixture\StubFilterTab;
use KonradMichalik\PagetreeLens\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

final class TabRegistryTest extends TestCase
{
    #[Test]
    public function returnsTabsInPriorityOrder(): void
    {
        $registry = $this->createRegistry([
            [new StubFilterTab('low', ['a']), 0],
            [new StubFilterTab('high', ['b']), 100],
        ]);

        self::assertSame(
            ['high', 'low'],
            array_map(static fn (FilterTabInterface $tab): string => $tab->getIdentifier(), $registry->getTabs($this->createBackendUser())),
        );
    }

    #[Test]
    public function disabledTabsFromExtensionConfigurationAreRemoved(): void
    {
        $registry = $this->createRegistry(
            [[new StubFilterTab('doktype', ['doktype']), 70], [new StubFilterTab('state', ['is']), 60]],
            ['disabledTabs' => 'state'],
        );

        $tabs = $registry->getTabs($this->createBackendUser());
        self::assertCount(1, $tabs);
        self::assertSame('doktype', $tabs[0]->getIdentifier());
    }

    #[Test]
    public function disabledTabsFromUserTsConfigAreRemoved(): void
    {
        $registry = $this->createRegistry(
            [[new StubFilterTab('doktype', ['doktype']), 70], [new StubFilterTab('state', ['is']), 60]],
        );
        $backendUser = $this->createBackendUser(['tx_pagetreelens.' => ['disableTabs' => 'doktype']]);

        $tabs = $registry->getTabs($backendUser);
        self::assertCount(1, $tabs);
        self::assertSame('state', $tabs[0]->getIdentifier());
    }

    #[Test]
    public function tokensOfDisabledTabsBecomeUnknown(): void
    {
        $registry = $this->createRegistry(
            [[new StubFilterTab('state', ['is']), 60]],
            ['disabledTabs' => 'state'],
        );

        self::assertNull($registry->findTabForToken(new Token('is', ['empty'], 'is:empty'), $this->createBackendUser()));
    }

    #[Test]
    public function userTsConfigDisableSwitchesTheFeatureOff(): void
    {
        $registry = $this->createRegistry([[new StubFilterTab('doktype', ['doktype']), 70]]);
        $backendUser = $this->createBackendUser(['tx_pagetreelens.' => ['disable' => '1']]);

        self::assertTrue($registry->isDisabledForUser($backendUser));
        self::assertSame([], $registry->getTabs($backendUser));
    }

    #[Test]
    public function adminOnlyModeLocksOutNonAdmins(): void
    {
        $registry = $this->createRegistry([[new StubFilterTab('doktype', ['doktype']), 70]], ['adminOnly' => '1']);

        self::assertTrue($registry->isDisabledForUser($this->createBackendUser(admin: false)));
        self::assertFalse($registry->isDisabledForUser($this->createBackendUser(admin: true)));
    }

    #[Test]
    public function findsOwningTabForToken(): void
    {
        $registry = $this->createRegistry([[new StubFilterTab('records', ['table', 'record', 'text']), 100]]);

        $tab = $registry->findTabForToken(new Token('text', ['foo'], 'text:foo'), $this->createBackendUser());
        self::assertSame('records', $tab?->getIdentifier());
        self::assertNull($registry->findTabForToken(new Token('nope', ['x'], 'nope:x'), $this->createBackendUser()));
    }

    /**
     * @param list<array{0: FilterTabInterface, 1: int}> $registrations
     * @param array<string, string> $extensionConfiguration
     */
    private function createRegistry(array $registrations, array $extensionConfiguration = []): TabRegistry
    {
        $extensionConfigurationMock = $this->createStub(ExtensionConfiguration::class);
        $extensionConfigurationMock
            ->method('get')
            ->willReturnCallback(
                static fn (string $extension, string $path = ''): string => $extensionConfiguration[$path] ?? '',
            );

        return new TabRegistry(new CollectingEventDispatcher($registrations), $extensionConfigurationMock);
    }

    private function createBackendUser(array $tsConfig = [], bool $admin = true): BackendUserAuthentication&Stub
    {
        $backendUser = $this->createStub(BackendUserAuthentication::class);
        $backendUser->method('getTSConfig')->willReturn($tsConfig);
        $backendUser->method('isAdmin')->willReturn($admin);

        return $backendUser;
    }
}
