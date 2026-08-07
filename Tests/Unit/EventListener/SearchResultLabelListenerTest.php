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
use TYPO3\CMS\Backend\Controller\Event\AfterPageTreeItemsPreparedEvent;
use TYPO3\CMS\Backend\Dto\Tree\Label\Label;
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
        (new SearchResultLabelListener(new MatchedPageRegistry()))($event);

        foreach ($event->getItems() as $item) {
            self::assertArrayNotHasKey('labels', $item);
        }
    }

    #[Test]
    public function onlyMatchedPagesAreLabelled(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([20]);

        // 10 is a rootline ancestor the core rendered for context, 20 the hit.
        $event = $this->createEvent([$this->createItem(10), $this->createItem(20)]);
        (new SearchResultLabelListener($registry))($event);

        $items = $event->getItems();
        // Untouched entirely rather than given an empty labels array: other
        // listeners on this event should see the item exactly as it was.
        self::assertArrayNotHasKey('labels', $items[0]);
        self::assertCount(1, $items[1]['labels']);
    }

    #[Test]
    public function theLabelMirrorsTheCoreSearchResultAppearance(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([20]);

        $event = $this->createEvent([$this->createItem(20)]);
        (new SearchResultLabelListener($registry))($event);

        $label = $event->getItems()[0]['labels'][0];
        self::assertInstanceOf(Label::class, $label);
        self::assertSame('Matches the filter', $label->label);
        // Same colour the core uses for its own "Search result" label.
        self::assertSame('#F5A770', $label->color);
        // Priority 0 deliberately loses against an existing TSconfig page label
        // and against the core's translation label (priority 1) - the stripe is
        // context, not the headline.
        self::assertSame(0, $label->priority);
        // Would otherwise spill the stripe onto every child of a hit.
        self::assertFalse($label->inheritByChildren);
    }

    #[Test]
    public function existingLabelsArePreserved(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([20]);

        $existing = new Label(label: 'Marketing', color: '#ff8700');
        $item = $this->createItem(20);
        $item['labels'] = [$existing];

        $event = $this->createEvent([$item]);
        (new SearchResultLabelListener($registry))($event);

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
        (new SearchResultLabelListener($registry))($event);

        foreach ($event->getItems() as $item) {
            self::assertArrayNotHasKey('labels', $item);
        }
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
     * @param list<array<string, mixed>> $items
     */
    private function createEvent(array $items): AfterPageTreeItemsPreparedEvent
    {
        return new AfterPageTreeItemsPreparedEvent(self::createStub(ServerRequestInterface::class), $items);
    }
}
