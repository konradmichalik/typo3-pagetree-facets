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
 * ({@see \TYPO3\CMS\Backend\Tree\Repository\PageTreeFilter::attachSearchResultLabel()}):
 * same event, same colour, same priority. The core renders only the
 * highest-priority label of a node as a narrow colour stripe and joins every
 * label's text into the node tooltip
 * ({@see tree.js#getNodeLabels()}/{@see tree.js#createNodeLabel()}), so
 * priority 0 is what keeps this a hint rather than a headline: an existing
 * TSconfig page label (also priority 0, but attached earlier) and the core's
 * translation label (priority 1) both keep the stripe, and our text still shows
 * up in the tooltip.
 *
 * Whether a facet filter ran at all is not derivable here - the event carries
 * only the raw phrase - so it is answered by MatchedPageRegistry, which
 * PageTreeFilterListener filled during the same request.
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
    private const string LABEL_COLOR = '#F5A770';

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

        $label = $this->getLanguageService()->sL('typo3_pagetree_facets.tree:tree.match') ?: 'Matches the filter';
        $items = $event->getItems();
        foreach ($items as &$item) {
            $page = $item['_page'] ?? null;
            // "_page" is documented as being there for events like this one, but
            // it is not part of the item contract - never assume its shape.
            if (!is_array($page) || !isset($page['uid'])) {
                continue;
            }
            if (!$this->registry->matches((int) $page['uid'])) {
                continue;
            }
            if (!isset($item['labels'])) {
                $item['labels'] = [];
            }
            $item['labels'][] = new Label(
                label: $label,
                color: self::LABEL_COLOR,
                // inheritByChildren is flagged @internal, yet its default (true)
                // is the wrong answer here: it would hand the stripe down to
                // every child of a hit. The core's search-result label passes
                // false for the same reason.
                inheritByChildren: false,
            );
        }
        unset($item);

        $event->setItems($items);
    }

    private function getLanguageService(): LanguageService
    {
        return $GLOBALS['LANG'];
    }
}
