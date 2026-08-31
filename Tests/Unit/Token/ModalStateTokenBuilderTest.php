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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Token;

use KonradMichalik\PagetreeFacets\Api\{FacetInterface, FilterContext};
use KonradMichalik\PagetreeFacets\Service\FacetRegistry;
use KonradMichalik\PagetreeFacets\Tests\Unit\Fixture\CollectingEventDispatcher;
use KonradMichalik\PagetreeFacets\Token\{ModalStateTokenBuilder, Token};
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Configuration\ExtensionConfiguration;

use function is_string;

/**
 * ModalStateTokenBuilderTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class ModalStateTokenBuilderTest extends TestCase
{
    #[Test]
    public function aFacetWithNonEmptyStateContributesItsSerializedTokens(): void
    {
        $tokens = $this->createSubject([$this->createRecordingFacet('doktype')])->build(
            ['states' => ['doktype' => ['doktype' => ['1']]]],
            $this->createBackendUser(),
        );

        self::assertSame('doktype:1', $tokens[0]->raw);
    }

    #[Test]
    public function aFacetWithEmptyOrAbsentStateContributesNothing(): void
    {
        $subject = $this->createSubject([$this->createRecordingFacet('doktype')]);

        self::assertSame([], $subject->build(['states' => ['doktype' => []]], $this->createBackendUser()));
        self::assertSame([], $subject->build([], $this->createBackendUser()));
    }

    #[Test]
    public function tokensFromMultipleFacetsAreMerged(): void
    {
        $subject = $this->createSubject([
            $this->createRecordingFacet('doktype'),
            $this->createRecordingFacet('state'),
        ]);

        $tokens = $subject->build([
            'states' => [
                'doktype' => ['doktype' => ['1']],
                'state' => ['is' => ['empty']],
            ],
        ], $this->createBackendUser());

        self::assertSame(['doktype:1', 'is:empty'], array_map(static fn (Token $token): string => $token->raw, $tokens));
    }

    #[Test]
    public function nonEmptySiteProducesASiteToken(): void
    {
        $tokens = $this->createSubject()->build(['site' => 'main'], $this->createBackendUser());

        self::assertSame('site:main', $tokens[0]->raw);
    }

    #[Test]
    public function emptyOrAbsentSiteProducesNoSiteToken(): void
    {
        $subject = $this->createSubject();

        self::assertSame([], $subject->build(['site' => ''], $this->createBackendUser()));
        self::assertSame([], $subject->build([], $this->createBackendUser()));
    }

    #[Test]
    public function positivePageScopeProducesAnUnderToken(): void
    {
        $tokens = $this->createSubject()->build(['pageScope' => 5], $this->createBackendUser());

        self::assertSame('under:5', $tokens[0]->raw);
    }

    #[Test]
    public function zeroOrAbsentPageScopeProducesNoUnderToken(): void
    {
        $subject = $this->createSubject();

        self::assertSame([], $subject->build(['pageScope' => 0], $this->createBackendUser()));
        self::assertSame([], $subject->build([], $this->createBackendUser()));
    }

    #[Test]
    public function nonEmptyTrimmedFreetextProducesAFreetextToken(): void
    {
        $tokens = $this->createSubject()->build(['freetext' => ' solar park '], $this->createBackendUser());

        self::assertTrue($tokens[0]->isFreetext());
        self::assertSame('solar park', $tokens[0]->firstValue());
    }

    #[Test]
    public function emptyOrWhitespaceOnlyFreetextProducesNoToken(): void
    {
        $subject = $this->createSubject();

        self::assertSame([], $subject->build(['freetext' => ''], $this->createBackendUser()));
        self::assertSame([], $subject->build(['freetext' => '   '], $this->createBackendUser()));
        self::assertSame([], $subject->build([], $this->createBackendUser()));
    }

    /**
     * @param list<FacetInterface> $facets
     */
    private function createSubject(array $facets = []): ModalStateTokenBuilder
    {
        $registrations = array_map(static fn (FacetInterface $facet): array => [$facet, 0], $facets);

        $extensionConfigurationStub = self::createStub(ExtensionConfiguration::class);
        $extensionConfigurationStub->method('get')->willReturn('');

        return new ModalStateTokenBuilder(new FacetRegistry(
            new CollectingEventDispatcher($registrations),
            $extensionConfigurationStub,
        ));
    }

    /**
     * A facet whose serialize() turns its own modal state back into exactly
     * one token, mirroring how the real built-in tabs' serialize() methods
     * behave for a single-value field.
     *
     * @param non-empty-string $identifier
     */
    private function createRecordingFacet(string $identifier): FacetInterface
    {
        return new readonly class($identifier) implements FacetInterface {
            /**
             * @param non-empty-string $identifier
             */
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

            /**
             * @return list<non-empty-string>
             */
            /**
             * @return list<non-empty-string>
             */
            public function getTokenKeys(): array
            {
                return [$this->identifier];
            }

            public function resolvePageUids(Token $token, FilterContext $context): array
            {
                return [];
            }

            public function getModalConfiguration(FilterContext $context): array
            {
                return ['fields' => []];
            }

            public function serialize(array $modalState): array
            {
                $key = array_key_first($modalState);
                if (!is_string($key) || '' === $key) {
                    return [];
                }
                /** @var list<string> $values */
                $values = $modalState[$key];

                return [new Token($key, $values, $key.':'.implode(',', $values))];
            }

            public function hydrate(array $tokens): array
            {
                return [];
            }
        };
    }

    private function createBackendUser(): BackendUserAuthentication
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('getTSConfig')->willReturn([]);
        $backendUser->method('isAdmin')->willReturn(true);
        $backendUser->workspace = 0;

        return $backendUser;
    }
}
