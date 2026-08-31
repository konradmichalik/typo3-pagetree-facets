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

use KonradMichalik\PagetreeFacets\Api\FilterOptionInterface;
use KonradMichalik\PagetreeFacets\Service\OptionRegistry;
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\{CollectingOptionEventDispatcher, StubFilterOption};
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\Exception\ExtensionConfigurationPathDoesNotExistException;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

/**
 * OptionRegistryTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class OptionRegistryTest extends TestCase
{
    #[Test]
    public function returnsOptionsForOneTokenKeyInPriorityOrder(): void
    {
        $registry = $this->createRegistry([
            [new StubFilterOption('is', 'low', []), 0],
            [new StubFilterOption('seo', 'other', []), 100],
            [new StubFilterOption('is', 'high', []), 100],
        ]);

        self::assertSame(
            ['high', 'low'],
            array_map(
                static fn (FilterOptionInterface $option): string => $option->getValue(),
                $registry->getOptions('is', $this->createBackendUser()),
            ),
        );
    }

    #[Test]
    public function findsOwningOptionForValue(): void
    {
        $registry = $this->createRegistry([
            [new StubFilterOption('is', 'empty', [1, 2]), 0],
        ]);

        $option = $registry->findOption('is', 'empty', $this->createBackendUser());
        self::assertSame('empty', $option?->getValue());
        self::assertNull($registry->findOption('is', 'bogus', $this->createBackendUser()));
        self::assertNull($registry->findOption('seo', 'empty', $this->createBackendUser()));
    }

    #[Test]
    public function disabledOptionsFromExtensionConfigurationAreRemoved(): void
    {
        $registry = $this->createRegistry(
            [[new StubFilterOption('is', 'empty', []), 0], [new StubFilterOption('is', 'editlocked', []), 0]],
            ['disabledOptions' => 'is:editlocked'],
        );

        $values = array_map(
            static fn (FilterOptionInterface $option): string => $option->getValue(),
            $registry->getOptions('is', $this->createBackendUser()),
        );
        self::assertSame(['empty'], $values);
        self::assertNull($registry->findOption('is', 'editlocked', $this->createBackendUser()));
    }

    #[Test]
    public function disabledOptionsFromUserTsConfigAreRemoved(): void
    {
        $registry = $this->createRegistry([[new StubFilterOption('seo', 'nofollow', []), 0]]);
        $backendUser = $this->createBackendUser(['tx_typo3pagetreefacets.' => ['disableOptions' => 'seo:nofollow']]);

        self::assertSame([], $registry->getOptions('seo', $backendUser));
    }

    #[Test]
    public function eventIsDispatchedOnlyOnce(): void
    {
        $dispatcher = new CollectingOptionEventDispatcher([[new StubFilterOption('is', 'empty', []), 0]]);
        $registry = new OptionRegistry($dispatcher, $this->createExtensionConfiguration());

        $registry->getOptions('is', $this->createBackendUser());
        $registry->getOptions('seo', $this->createBackendUser());
        $registry->findOption('is', 'empty', $this->createBackendUser());

        self::assertSame(1, $dispatcher->dispatchCount);
    }

    #[Test]
    public function missingExtensionConfigurationIsTreatedAsNotSet(): void
    {
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willThrowException(
            new ExtensionConfigurationPathDoesNotExistException('not configured', 1668941190),
        );
        $registry = new OptionRegistry(
            new CollectingOptionEventDispatcher([[new StubFilterOption('is', 'empty', []), 0]]),
            $extensionConfiguration,
        );

        self::assertCount(1, $registry->getOptions('is', $this->createBackendUser()));
    }

    /**
     * @param list<array{0: FilterOptionInterface, 1: int}> $registrations
     * @param array<string, string>                         $extensionConfiguration
     */
    private function createRegistry(array $registrations, array $extensionConfiguration = []): OptionRegistry
    {
        return new OptionRegistry(
            new CollectingOptionEventDispatcher($registrations),
            $this->createExtensionConfiguration($extensionConfiguration),
        );
    }

    /**
     * @param array<string, string> $extensionConfiguration
     */
    private function createExtensionConfiguration(array $extensionConfiguration = []): ExtensionConfiguration&Stub
    {
        $stub = self::createStub(ExtensionConfiguration::class);
        $stub->method('get')->willReturnCallback(
            static fn (string $extension, string $path = ''): string => $extensionConfiguration[$path] ?? '',
        );

        return $stub;
    }

    /**
     * @param array<string, mixed> $tsConfig
     */
    private function createBackendUser(array $tsConfig = []): BackendUserAuthentication&Stub
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getTSConfig')->willReturn($tsConfig);

        return $backendUser;
    }
}
