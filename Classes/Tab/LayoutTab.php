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

namespace KonradMichalik\PagetreeFacets\Tab;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\ContentQueryHelper;
use KonradMichalik\PagetreeFacets\Token\Token;
use TYPO3\CMS\Backend\View\BackendLayoutView;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;
use TYPO3\CMS\Core\Site\SiteFinder;

/**
 * LayoutTab.
 *
 * The two layout fields on a page, one token key each:
 *
 * - "layout:"     -> pages.backend_layout, the grid the page module renders.
 *   Values are the combined identifiers TYPO3 stores: a backend_layout record
 *   uid ("10"), a page-TSconfig layout ("pagets__<key>"), or "-1" for the
 *   explicit "none".
 * - "pagelayout:" -> pages.layout, the frontend layout selector ("0".."3" out
 *   of the box, extended by projects through a TCA override).
 *
 * Both match the value set ON the page, deliberately NOT the effective one: a
 * page whose backend_layout is empty and that only inherits a parent's
 * backend_layout_next_level is not a match. Resolving inheritance would mean
 * walking the rootline per candidate, which does not scale on large trees, and
 * the direct-field reading is the same one PageStateTab's "is:restricted" uses
 * for fe_group.
 *
 * backend_layout_next_level has no token for the same reason it is a separate
 * field in TCA: "what this page uses" and "what this page hands down" are
 * different questions, and conflating them into one token would make a hit
 * ambiguous.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class LayoutTab extends AbstractPagesQueryTab
{
    /** Token key => the pages column it matches. */
    private const FIELDS = [
        'layout' => 'backend_layout',
        'pagelayout' => 'layout',
    ];

    public function __construct(
        ContentQueryHelper $queryHelper,
        private readonly BackendLayoutView $backendLayoutView,
        private readonly SiteFinder $siteFinder,
    ) {
        parent::__construct($queryHelper);
    }

    public function getIdentifier(): string
    {
        return 'layout';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.layout';
    }

    public function getGroup(): string
    {
        return 'content';
    }

    public function getTokenKeys(): array
    {
        return array_keys(self::FIELDS);
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $column = self::FIELDS[$token->key] ?? null;
        if (null === $column) {
            return [];
        }

        $layouts = array_values(array_filter(
            array_map(trim(...), $token->values),
            static fn (string $value): bool => '' !== $value,
        ));
        if ([] === $layouts) {
            return [];
        }

        return $this->fetchPageUids($context, static function (QueryBuilder $queryBuilder) use ($column, $layouts): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->in(
                    $column,
                    $queryBuilder->createNamedParameter($layouts, Connection::PARAM_STR_ARRAY),
                ),
            );
        });
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        $lll = 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:layout.';
        $fields = [];

        // A field with no options at all would render as an empty heading - an
        // install without a single backend layout should just not show one.
        $backendLayouts = $this->collectBackendLayoutOptions();
        if ([] !== $backendLayouts) {
            $fields[] = ['type' => 'checkbox-group', 'name' => 'layout', 'label' => $lll.'backend', 'options' => $backendLayouts];
        }

        $frontendLayouts = $this->collectFrontendLayoutOptions();
        if ([] !== $frontendLayouts) {
            $fields[] = ['type' => 'checkbox-group', 'name' => 'pagelayout', 'label' => $lll.'frontend', 'options' => $frontendLayouts];
        }

        return ['fields' => $fields];
    }

    /**
     * pages.layout is a plain static select, so unlike the backend layouts its
     * options need no data provider - a project's own TCA override items come
     * along for free.
     *
     * Value "0" is skipped: it is the column default, so as a facet it would
     * match virtually every page in the tree. Typing "pagelayout:0" still
     * works for anyone who really wants it.
     *
     * @return list<array{value: string, label: string, icon: string}>
     */
    private function collectFrontendLayoutOptions(): array
    {
        $options = [];
        foreach ($GLOBALS['TCA']['pages']['columns']['layout']['config']['items'] ?? [] as $item) {
            $value = (string) ($item['value'] ?? '');
            if ('' === $value || '0' === $value || str_starts_with($value, '--')) {
                continue;
            }
            $options[] = [
                'value' => $value,
                'label' => (string) ($item['label'] ?? $value),
                'icon' => (string) ($item['icon'] ?? ''),
            ];
        }

        return $options;
    }

    /**
     * Layout items come from an itemsProcFunc, not from static TCA - reading
     * TCA alone would yield nothing but the two placeholder entries. Going
     * through BackendLayoutView is what makes both data providers (records and
     * page TSconfig) and the "options.backendLayout.exclude" TSconfig apply,
     * exactly as they do in FormEngine.
     *
     * Collected once per site root plus page 0, then deduplicated by value.
     * A tree-wide filter has no single page whose TSconfig is "the" right one,
     * and page 0 alone is not enough: it sees globally registered page TSconfig
     * (a site package's page.tsconfig) but not layouts written into a root
     * page's own TSconfig field, which is just as common. Site roots are where
     * that configuration is anchored, and there are only ever a handful.
     *
     * @return list<array{value: string, label: string, icon: string}>
     */
    private function collectBackendLayoutOptions(): array
    {
        $options = [];
        foreach ($this->layoutResolutionPageIds() as $pageId) {
            foreach ($this->layoutItemsForPage($pageId) as $item) {
                $value = (string) ($item['value'] ?? '');
                // The empty placeholder is FormEngine's "not set" entry. As a
                // facet it would read "pages without a layout", a different
                // query than the one this tab answers - drop it rather than
                // let it serialize into a valueless "layout:" token.
                if ('' === $value || isset($options[$value])) {
                    continue;
                }
                $options[$value] = [
                    'value' => $value,
                    'label' => (string) ($item['label'] ?? $value),
                    'icon' => (string) ($item['icon'] ?? ''),
                ];
            }
        }

        return array_values($options);
    }

    /**
     * Repeats are fine and not guarded against: collectBackendLayoutOptions()
     * already keys its result by option value.
     *
     * @return list<int>
     */
    private function layoutResolutionPageIds(): array
    {
        $pageIds = [0];
        foreach ($this->siteFinder->getAllSites() as $site) {
            $pageIds[] = $site->getRootPageId();
        }

        return $pageIds;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function layoutItemsForPage(int $pageId): array
    {
        $parameters = [
            'items' => $GLOBALS['TCA']['pages']['columns']['backend_layout']['config']['items'] ?? [],
            'table' => 'pages',
            'field' => 'backend_layout',
            // addBackendLayoutItems() derives the page id from this row - for
            // "pages" that is its uid. An empty row would pin it to 0.
            'row' => ['uid' => $pageId, 'pid' => 0],
        ];
        $this->backendLayoutView->addBackendLayoutItems($parameters);

        return array_values($parameters['items']);
    }
}
