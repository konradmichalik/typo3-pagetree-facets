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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\EventListener;

use KonradMichalik\PagetreeFacets\EventListener\SearchResultLabelListener;
use KonradMichalik\PagetreeFacets\Service\MatchedPageRegistry;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ServerRequestInterface;
use ReflectionClass;
use TYPO3\CMS\Backend\Controller\Event\AfterPageTreeItemsPreparedEvent;
use TYPO3\CMS\Backend\Dto\Tree\Label\Label;
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Localization\LanguageService;

/**
 * SearchResultLabelListenerTest.
 *
 * Marks the pages a facet filter actually hit, so they can be told apart from
 * the rootline ancestors the core renders alongside them. The contract is
 * narrow on purpose: touch nothing unless a facet filter ran, and only ever
 * append to whatever labels an item already carries.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class SearchResultLabelListenerTest extends TestCase
{
    protected function setUp(): void
    {
        $languageService = self::createStub(LanguageService::class);
        $languageService->method('sL')->willReturn('Matches the filter');
        $GLOBALS['LANG'] = $languageService;
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['LANG']);
    }

    #[Test]
    public function withoutAFacetFilterNoItemIsTouched(): void
    {
        // The event fires on every tree render, including plain fetches and the
        // core's own title search - neither is ours to annotate.
        $event = $this->createEvent([$this->createItem(10), $this->createItem(20)]);
        (new SearchResultLabelListener(new MatchedPageRegistry(), $this->typo3Version(14)))($event);

        foreach ($event->getItems() as $item) {
            self::assertArrayNotHasKey('labels', $item);
        }
    }

    #[Test]
    public function onlyMatchedPagesAreLabelledOnV14(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([20]);

        // 10 is a rootline ancestor the core rendered for context, 20 the hit.
        $event = $this->createEvent([$this->createItem(10), $this->createItem(20)]);
        (new SearchResultLabelListener($registry, $this->typo3Version(14)))($event);

        $items = $event->getItems();
        // Untouched entirely rather than given an empty labels array: other
        // listeners on this event should see the item exactly as it was.
        self::assertArrayNotHasKey('labels', $items[0]);
        self::assertCount(1, $items[1]['labels']);
    }

    /**
     * On v13 the ancestor is the one item that must carry something - an
     * invisible label is the only way to stop it inheriting the hit stripe
     * from a marked parent (v13's tree.js inherits a parent's labels to any
     * node carrying none of its own, and Label has no inheritByChildren flag
     * there to stop it).
     */
    #[Test]
    public function onlyMatchedPagesAreLabelledOnV13(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([20]);

        $event = $this->createEvent([$this->createItem(10), $this->createItem(20)]);
        (new SearchResultLabelListener($registry, $this->typo3Version(13)))($event);

        $items = $event->getItems();
        self::assertCount(1, $items[0]['labels']);
        $blocker = $items[0]['labels'][0];
        self::assertInstanceOf(Label::class, $blocker);
        self::assertSame('', $blocker->label);
        self::assertSame('transparent', $blocker->color);
        self::assertCount(1, $items[1]['labels']);
    }

    #[Test]
    public function theLabelMirrorsTheCoreSearchResultAppearanceOnV14(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([20]);

        $event = $this->createEvent([$this->createItem(20)]);
        (new SearchResultLabelListener($registry, $this->typo3Version(14)))($event);

        $label = $event->getItems()[0]['labels'][0];
        self::assertInstanceOf(Label::class, $label);
        self::assertSame('Matches the filter', $label->label);
        // Same colour the core uses for its own "Search result" label.
        self::assertSame('#F5A770', $label->color);
        self::assertSame(0, $label->priority);
        // The injected Typo3Version(14) above only controls the listener's own
        // branching - it says nothing about which real Label class Composer
        // actually installed for this test run. inheritByChildren only exists
        // on the real v14+ DTO, so reading it against a real v13 install (as
        // CI's own dependency matrix does) would silently return null.
        if (self::realCoreIsV14OrNewer()) {
            // Would otherwise spill the stripe onto every child of a hit.
            self::assertFalse($label->inheritByChildren);
        }
    }

    /**
     * The v13 branch calls Label's 3-arg constructor - real v13 Label has no
     * fourth parameter at all, but this suite always runs against a real v14
     * core (see the class docblock), so the only thing verifiable here is that
     * the listener does not pass inheritByChildren, letting it fall back to
     * the constructor default rather than asserting on v13's actual DTO shape.
     */
    #[Test]
    public function theLabelMirrorsTheCoreSearchResultAppearanceOnV13(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([20]);

        $event = $this->createEvent([$this->createItem(20)]);
        (new SearchResultLabelListener($registry, $this->typo3Version(13)))($event);

        $label = $event->getItems()[0]['labels'][0];
        self::assertInstanceOf(Label::class, $label);
        self::assertSame('Matches the filter', $label->label);
        self::assertSame('#F5A770', $label->color);
        self::assertSame(0, $label->priority);
    }

    #[Test]
    public function existingLabelsArePreserved(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([20]);

        $existing = new Label('Marketing', '#ff8700');
        $item = $this->createItem(20);
        $item['labels'] = [$existing];

        $event = $this->createEvent([$item]);
        (new SearchResultLabelListener($registry, $this->typo3Version(14)))($event);

        $labels = $event->getItems()[0]['labels'];
        self::assertCount(2, $labels);
        self::assertSame($existing, $labels[0]);
    }

    #[Test]
    public function itemsWithoutPageDataAreSkipped(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([20]);

        // "_page" is documented as "only for use in events"; an item that never
        // got one (or got something else) must not blow up the tree render.
        $event = $this->createEvent([['identifier' => '20'], ['identifier' => '20', '_page' => 'nonsense']]);
        (new SearchResultLabelListener($registry, $this->typo3Version(14)))($event);

        foreach ($event->getItems() as $item) {
            self::assertArrayNotHasKey('labels', $item);
        }
    }

    private function typo3Version(int $majorVersion): Typo3Version
    {
        return new class($majorVersion) extends Typo3Version {
            public function __construct(private readonly int $major) {}

            public function getMajorVersion(): int
            {
                return $this->major;
            }
        };
    }

    /**
     * The real, Composer-installed core version - independent of whatever
     * Typo3Version instance a test injects into the listener itself.
     */
    private static function realCoreIsV14OrNewer(): bool
    {
        return (new Typo3Version())->getMajorVersion() >= 14;
    }

    /**
     * @return array<string, mixed>
     */
    private function createItem(int $uid): array
    {
        return [
            'identifier' => (string) $uid,
            '_page' => ['uid' => $uid, 'title' => 'Page '.$uid],
        ];
    }

    /**
     * A core patch release added a $searchQuery parameter between $request
     * and $items - built via newInstanceArgs() rather than a hardcoded
     * version boundary or a direct call with either shape, since the break
     * landed in a patch (14.3.7, not a place a major/minor check would catch)
     * and static analysis can only ever see one of the two shapes installed.
     *
     * @param list<array<string, mixed>> $items
     */
    private function createEvent(array $items): AfterPageTreeItemsPreparedEvent
    {
        $request = self::createStub(ServerRequestInterface::class);
        $reflection = new ReflectionClass(AfterPageTreeItemsPreparedEvent::class);
        $arguments = 3 === $reflection->getMethod('__construct')->getNumberOfParameters()
            ? [$request, null, $items]
            : [$request, $items];

        return $reflection->newInstanceArgs($arguments);
    }
}
