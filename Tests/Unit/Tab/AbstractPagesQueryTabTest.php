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

namespace KonradMichalik\PagetreeLens\Tests\Unit\Tab;

use KonradMichalik\PagetreeLens\Api\FilterContext;
use KonradMichalik\PagetreeLens\Service\ContentQueryHelper;
use KonradMichalik\PagetreeLens\Tab\AbstractPagesQueryTab;
use KonradMichalik\PagetreeLens\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Schema\SearchableSchemaFieldsCollector;

/**
 * The default serialize()/hydrate() mapping every declarative tab inherits -
 * hydrate() must invert serialize() for all producible states.
 */
final class AbstractPagesQueryTabTest extends TestCase
{
    #[Test]
    public function serializeMapsModalStateToTokens(): void
    {
        $tokens = $this->createTab()->serialize(['is' => ['empty', 'hidden'], 'other' => ['x'], 'unknown' => ['y']]);

        self::assertCount(2, $tokens);
        self::assertSame('is', $tokens[0]->key);
        self::assertSame(['empty', 'hidden'], $tokens[0]->values);
        self::assertSame('other', $tokens[1]->key);
    }

    #[Test]
    public function serializeSkipsEmptyValues(): void
    {
        self::assertSame([], $this->createTab()->serialize(['is' => ['', null], 'other' => []]));
    }

    #[Test]
    public function hydrateIsTheInverseOfSerialize(): void
    {
        $tab = $this->createTab();
        $state = ['is' => ['empty', 'hidden'], 'other' => ['x']];

        self::assertSame($state, $tab->hydrate($tab->serialize($state)));
    }

    #[Test]
    public function hydrateIgnoresForeignTokens(): void
    {
        $state = $this->createTab()->hydrate([new Token('doktype', ['1'], 'doktype:1')]);

        self::assertSame([], $state);
    }

    private function createTab(): AbstractPagesQueryTab
    {
        $queryHelper = new ContentQueryHelper(
            $this->createStub(ConnectionPool::class),
            $this->createStub(SearchableSchemaFieldsCollector::class),
        );

        return new class($queryHelper) extends AbstractPagesQueryTab {
            public function getIdentifier(): string { return 'test'; }
            public function getLabel(): string { return 'test'; }
            public function getTokenKeys(): array { return ['is', 'other']; }
            public function resolvePageUids(Token $token, FilterContext $context): array { return []; }
            public function getModalConfiguration(FilterContext $context): array { return ['fields' => []]; }
        };
    }
}
