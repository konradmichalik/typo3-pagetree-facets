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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Tab;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\{ContentQueryHelper, OptionRegistry};
use KonradMichalik\PagetreeFacets\Tab\PageStateTab;
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\{CollectingOptionEventDispatcher, StubFilterOption};
use KonradMichalik\PagetreeFacets\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

/**
 * SupportsFilterOptionsTest.
 *
 * Unit-tests the vocabulary-tab trait through PageStateTab, feeding the
 * OptionRegistry stub options so no database is involved: appendOptions() merge
 * and resolveViaOptions() OR-combination are the units under test.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class SupportsFilterOptionsTest extends TestCase
{
    #[Test]
    public function modalConfigurationMergesRegisteredOptionsIntoTheField(): void
    {
        $tab = $this->createTab([
            [new StubFilterOption('is', 'empty'), 100],
            [new StubFilterOption('is', 'hidden'), 90],
        ]);

        $options = $tab->getModalConfiguration($this->createContext())['fields'][0]['options'];

        self::assertSame(['empty', 'hidden'], array_column($options, 'value'));
        self::assertSame('is.empty', $options[0]['label']);
        self::assertArrayNotHasKey('icon', $options[0], 'A null icon must not be merged in');
    }

    #[Test]
    public function modalConfigurationKeepsItsFieldsWhenNothingIsRegistered(): void
    {
        // The vocabulary tabs carry no options of their own - PageStateTab ships an
        // empty option list and relies entirely on the registry - so a backend
        // where every option is disabled must still yield the untouched field.
        $config = $this->createTab([])->getModalConfiguration($this->createContext());

        self::assertSame([], $config['fields'][0]['options']);
        self::assertSame('is', $config['fields'][0]['name']);
    }

    #[Test]
    public function resolveOrCombinesValuesWithinOneToken(): void
    {
        $tab = $this->createTab([
            [new StubFilterOption('is', 'empty', [1, 2]), 0],
            [new StubFilterOption('is', 'hidden', [2, 3]), 0],
        ]);

        $uids = $tab->resolvePageUids(new Token('is', ['empty', 'hidden'], 'is:empty,hidden'), $this->createContext());
        sort($uids);

        self::assertSame([1, 2, 3], $uids);
    }

    #[Test]
    public function anUnknownValueContributesNothing(): void
    {
        $tab = $this->createTab([[new StubFilterOption('is', 'empty', [1]), 0]]);

        self::assertSame([], $tab->resolvePageUids(new Token('is', ['bogus'], 'is:bogus'), $this->createContext()));
    }

    /**
     * @param list<array{0: \KonradMichalik\PagetreeFacets\Api\FilterOptionInterface, 1: int}> $registrations
     */
    private function createTab(array $registrations): PageStateTab
    {
        $extensionConfiguration = self::createStub(ExtensionConfiguration::class);
        $extensionConfiguration->method('get')->willReturn('');
        $registry = new OptionRegistry(new CollectingOptionEventDispatcher($registrations), $extensionConfiguration);

        return new PageStateTab(self::createStub(ContentQueryHelper::class), $registry);
    }

    private function createContext(): FilterContext
    {
        return new FilterContext(backendUser: $this->createBackendUser(), workspaceId: 0);
    }

    private function createBackendUser(): BackendUserAuthentication&Stub
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getTSConfig')->willReturn([]);

        return $backendUser;
    }
}
