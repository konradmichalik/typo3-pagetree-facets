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

use KonradMichalik\PagetreeFacets\Api\FacetInterface;
use KonradMichalik\PagetreeFacets\Service\FacetRegistry;
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\{CollectingEventDispatcher, StubFacet};
use KonradMichalik\PagetreeFacets\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\Exception\ExtensionConfigurationPathDoesNotExistException;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

/**
 * FacetRegistryTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FacetRegistryTest extends TestCase
{
    #[Test]
    public function returnsFacetsInPriorityOrder(): void
    {
        $registry = $this->createRegistry([
            [new StubFacet('low', ['a'], []), 0],
            [new StubFacet('high', ['b'], []), 100],
        ]);

        self::assertSame(
            ['high', 'low'],
            array_map(static fn (FacetInterface $facet): string => $facet->getIdentifier(), $registry->getFacets($this->createBackendUser())),
        );
    }

    #[Test]
    public function disabledFacetsFromExtensionConfigurationAreRemoved(): void
    {
        $registry = $this->createRegistry(
            [[new StubFacet('doktype', ['doktype'], []), 70], [new StubFacet('state', ['is'], []), 60]],
            ['disabledFacets' => 'state'],
        );

        $facets = $registry->getFacets($this->createBackendUser());
        self::assertCount(1, $facets);
        self::assertSame('doktype', $facets[0]->getIdentifier());
    }

    #[Test]
    public function disabledFacetsFromUserTsConfigAreRemoved(): void
    {
        $registry = $this->createRegistry(
            [[new StubFacet('doktype', ['doktype'], []), 70], [new StubFacet('state', ['is'], []), 60]],
        );
        $backendUser = $this->createBackendUser(['tx_typo3pagetreefacets.' => ['disableFacets' => 'doktype']]);

        $facets = $registry->getFacets($backendUser);
        self::assertCount(1, $facets);
        self::assertSame('state', $facets[0]->getIdentifier());
    }

    #[Test]
    public function tokensOfDisabledFacetsBecomeUnknown(): void
    {
        $registry = $this->createRegistry(
            [[new StubFacet('state', ['is'], []), 60]],
            ['disabledFacets' => 'state'],
        );

        self::assertNull($registry->findFacetForToken(new Token('is', ['empty'], 'is:empty'), $this->createBackendUser()));
    }

    #[Test]
    public function userTsConfigDisableSwitchesTheFeatureOff(): void
    {
        $registry = $this->createRegistry([[new StubFacet('doktype', ['doktype'], []), 70]]);
        $backendUser = $this->createBackendUser(['tx_typo3pagetreefacets.' => ['disable' => '1']]);

        self::assertTrue($registry->isDisabledForUser($backendUser));
        self::assertSame([], $registry->getFacets($backendUser));
    }

    #[Test]
    public function adminOnlyModeLocksOutNonAdmins(): void
    {
        $registry = $this->createRegistry([[new StubFacet('doktype', ['doktype'], []), 70]], ['adminOnly' => '1']);

        self::assertTrue($registry->isDisabledForUser($this->createBackendUser([], false)));
        self::assertFalse($registry->isDisabledForUser($this->createBackendUser([], true)));
    }

    #[Test]
    public function missingExtensionConfigurationIsTreatedAsNotSet(): void
    {
        // Extension configuration paths do not exist before the extension has
        // ever been saved through the Settings module - get() throws in that
        // case; both isDisabledForUser() and the disabled-facets lookup must
        // degrade to "nothing configured" rather than propagate the exception.
        $extensionConfigurationMock = self::createStub(ExtensionConfiguration::class);
        $extensionConfigurationMock->method('get')->willThrowException(
            new ExtensionConfigurationPathDoesNotExistException('not configured', 1668941190),
        );
        $registry = new FacetRegistry(
            new CollectingEventDispatcher([[new StubFacet('doktype', ['doktype'], []), 70]]),
            $extensionConfigurationMock,
        );

        self::assertFalse($registry->isDisabledForUser($this->createBackendUser()));
        self::assertCount(1, $registry->getFacets($this->createBackendUser()));
    }

    #[Test]
    public function findsOwningFacetForToken(): void
    {
        $registry = $this->createRegistry([[new StubFacet('records', ['table', 'record', 'text'], []), 100]]);

        $facet = $registry->findFacetForToken(new Token('text', ['foo'], 'text:foo'), $this->createBackendUser());
        self::assertSame('records', $facet?->getIdentifier());
        self::assertNull($registry->findFacetForToken(new Token('nope', ['x'], 'nope:x'), $this->createBackendUser()));
    }

    /**
     * @param list<array{0: FacetInterface, 1: int}> $registrations
     * @param array<string, string>                  $extensionConfiguration
     */
    private function createRegistry(array $registrations, array $extensionConfiguration = []): FacetRegistry
    {
        $extensionConfigurationMock = self::createStub(ExtensionConfiguration::class);
        $extensionConfigurationMock
            ->method('get')
            ->willReturnCallback(
                static fn (string $extension, string $path = ''): string => $extensionConfiguration[$path] ?? '',
            );

        return new FacetRegistry(new CollectingEventDispatcher($registrations), $extensionConfigurationMock);
    }

    /**
     * @param array<string, mixed> $tsConfig
     */
    private function createBackendUser(array $tsConfig = [], bool $admin = true): BackendUserAuthentication&Stub
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getTSConfig')->willReturn($tsConfig);
        $backendUser->method('isAdmin')->willReturn($admin);

        return $backendUser;
    }
}
