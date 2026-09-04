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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Event;

use KonradMichalik\PagetreeFacets\Api\{FacetInterface, FilterContext};
use KonradMichalik\PagetreeFacets\Event\RegisterFacetsEvent;
use KonradMichalik\PagetreeFacets\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * RegisterFacetsEventTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RegisterFacetsEventTest extends TestCase
{
    #[Test]
    public function ordersByPriorityDescendingAndKeepsRegistrationOrderOnTie(): void
    {
        $event = new RegisterFacetsEvent();
        $event->addFacet($this->createFacet('third-party-a'));
        $event->addFacet($this->createFacet('built-in'), 100);
        $event->addFacet($this->createFacet('third-party-b'));

        self::assertSame(
            ['built-in', 'third-party-a', 'third-party-b'],
            array_map(static fn (FacetInterface $facet): string => $facet->getIdentifier(), $event->getFacets()),
        );
    }

    #[Test]
    public function returnsEmptyListWithoutRegistrations(): void
    {
        self::assertSame([], (new RegisterFacetsEvent())->getFacets());
    }

    private function createFacet(string $identifier): FacetInterface
    {
        return new class($identifier) implements FacetInterface {
            public function __construct(private string $identifier) {}

            public function getIdentifier(): string
            {
                return $this->identifier;
            }

            public function getLabel(): string
            {
                return $this->identifier;
            }

            public function getGroup(): ?string
            {
                return null;
            }

            public function getTokenKeys(): array
            {
                return [];
            }

            public function resolvePageUids(Token $token, FilterContext $context): array
            {
                return [];
            }

            /**
             * @return array{fields: list<array<string, mixed>>}
             */
            public function getModalConfiguration(FilterContext $context): array
            {
                return ['fields' => []];
            }

            public function serialize(array $modalState): array
            {
                return [];
            }

            public function hydrate(array $tokens): array
            {
                return [];
            }
        };
    }
}
