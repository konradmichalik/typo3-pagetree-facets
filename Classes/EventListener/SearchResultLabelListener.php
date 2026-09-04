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

namespace KonradMichalik\PagetreeFacets\EventListener;

use KonradMichalik\PagetreeFacets\Service\MatchedPageRegistry;
use TYPO3\CMS\Backend\Controller\Event\AfterPageTreeItemsPreparedEvent;
use TYPO3\CMS\Backend\Dto\Tree\Label\Label;
use TYPO3\CMS\Core\Attribute\AsEventListener;
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Localization\LanguageService;

use function is_array;

/**
 * SearchResultLabelListener.
 *
 * Marks the pages the filter actually hit. A filtered tree contains the hits
 * *plus the rootline that leads to them* (the core has to render the ancestors
 * to place a match in the hierarchy at all), and nothing in the rendered tree
 * tells the two apart - so a deeply nested match looks exactly like the branch
 * it hangs in.
 *
 * Mirrors the core's own search-result marker, which solves the same problem for
 * the plain title/UID search
 * ({@see \TYPO3\CMS\Backend\Tree\Repository\PageTreeFilter::attachSearchResultLabel()},
 * v14 only): same event, same colour, same priority. The core renders only the
 * highest-priority label of a node as a narrow colour stripe and joins every
 * label's text into the node tooltip
 * ({@see tree.js#getNodeLabels()}/{@see tree.js#createNodeLabel()}), so
 * priority 0 is what keeps this a hint rather than a headline: an existing
 * TSconfig page label (also priority 0, but attached earlier) and the core's
 * translation label (priority 1) both keep the stripe, and our text still shows
 * up in the tooltip.
 *
 * Whether a facet filter ran at all is not derivable here - the event carries
 * only the raw phrase - so it is answered by MatchedPageRegistry, which the
 * resolver filled during the same request.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
#[AsEventListener(identifier: 'pagetree-facets/search-result-label')]
final readonly class SearchResultLabelListener
{
    /**
     * The core's own search-result label colour, duplicated because
     * PageTreeFilter keeps it private. Sharing it is the point: a facet hit and
     * a title-search hit are the same kind of thing to the person looking at the
     * tree, and they never occur in the same render anyway (a phrase without
     * keyed tokens is left entirely to the core).
     */
    private const LABEL_COLOR = '#F5A770';

    /**
     * Colour of the v13 inheritance blocker below. The stripe is rendered
     * unconditionally as `background-color: <color>`, so the only way to have a
     * label that occupies a node without showing anything is a transparent one.
     */
    private const BLOCKER_COLOR = 'transparent';

    private const LABEL_KEY = 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang_tree.xlf:tree.match';

    public function __construct(
        private MatchedPageRegistry $registry,
    ) {}

    public function __invoke(AfterPageTreeItemsPreparedEvent $event): void
    {
        // Fires on every tree render - plain fetches and the core's own title
        // search included. Only a request that went through our filter engine
        // has a hit list to annotate.
        if (!$this->registry->isActive()) {
            return;
        }

        // Classic LLL: path rather than the shorter "typo3_pagetree_facets.tree:"
        // translation domain: domains are a v14 addition, and v13's sL() returns
        // anything without an LLL: prefix verbatim - which would print the raw
        // identifier into the node tooltip.
        $text = $this->getLanguageService()->sL(self::LABEL_KEY) ?: 'Matches the filter';

        // Both labels are built once and shared across every item: Label is
        // final readonly, and a broad criterion resolves to five-figure hit
        // sets - one instance per node would be that many allocations for two
        // distinct values.
        //
        // inheritByChildren is flagged @internal, yet its default (true) is the
        // wrong answer here: it would hand the stripe down to every child of a
        // hit. The core's search-result label passes false for the same reason.
        // The flag only exists from v14 on, which is what the blocker below is
        // for.
        $supportsInheritanceFlag = $this->supportsInheritanceFlag();
        $matchLabel = $supportsInheritanceFlag
            ? new Label($text, self::LABEL_COLOR, 0, false)
            : new Label($text, self::LABEL_COLOR, 0);
        $blocker = $supportsInheritanceFlag ? null : new Label('', self::BLOCKER_COLOR, 0);

        $items = $event->getItems();
        foreach ($items as &$item) {
            $uid = $this->pageUid($item);
            if (null !== $uid && $this->registry->matches($uid)) {
                $item['labels'] ??= [];
                $item['labels'][] = $matchLabel;

                continue;
            }

            if (null !== $blocker && [] === ($item['labels'] ?? [])) {
                $item['labels'] = [$blocker];
            }
        }
        unset($item);

        $event->setItems($items);
    }

    /**
     * "_page" is documented as being there for events like this one, but it is
     * not part of the item contract - never assume its shape. A node without
     * one still needs the blocker in __invoke(): it is exactly the kind of
     * unmarked node the v13 inheritance workaround exists for.
     *
     * @param array<string, mixed> $item
     */
    private function pageUid(array $item): ?int
    {
        $page = $item['_page'] ?? null;

        return is_array($page) && isset($page['uid']) ? (int) $page['uid'] : null;
    }

    /**
     * v13's tree.js inherits a parent's labels by any node that carries none of
     * its own, with no way to opt out - Label only grew the inheritByChildren
     * flag in v14. Left alone that would put the hit stripe on every rendered
     * descendant of a hit, and in a filtered tree those descendants are exactly
     * the rootline pages this listener exists to distinguish.
     *
     * The workaround in __invoke() is to leave no node without a label: hits get
     * the real one, everything else gets a transparent placeholder, and the
     * inheritance walk stops at every node. Its one visible trace is a trailing
     * "; " in the tooltip of unmarked nodes, because the core joins label texts
     * into the title unconditionally - which is why this is done on v13 only and
     * only while a facet filter is active.
     */
    private function supportsInheritanceFlag(): bool
    {
        return (new Typo3Version())->getMajorVersion() >= 14;
    }

    private function getLanguageService(): LanguageService
    {
        return $GLOBALS['LANG'];
    }
}
