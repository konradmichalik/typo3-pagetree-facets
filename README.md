<div align="center">

# 🔍 Pagetree Facets

**Filterable page tree for TYPO3 v14 — with an extensible filter tab API.**

`composer require konradmichalik/typo3-pagetree-facets`

</div>

> ⚠️ **Beta.** Built on the TYPO3 v14 `BeforePageTreeIsFilteredEvent`
> (`TYPO3\CMS\Backend\Tree\Repository`, Feature #105833). The event API surface
> is verified against TYPO3 v14.3; unit and functional suites run green — see
> [Status](#status).

## What it does

Type filter tokens directly into the page tree filter field — or use the
modal (`Ctrl/Cmd+Shift+F`):

```
doktype:1 is:empty                      # standard pages without content
table:tx_news_domain_model_news         # pages containing news records
ce:uploads updated:<30d                 # pages with uploads CE, touched last 30 days
untranslated:2 site:main               # pages missing the FR translation, main site only
seo:missing-description                 # indexable pages without meta description
text:"solar park"                       # pages whose content mentions "solar park"
```

Whitespace = AND. Comma = OR within one criterion (`doktype:1,4`). Freetext
without a `key:` prefix behaves exactly like the core title/UID search.
Unknown tokens are ignored, never an error.

## Built-in filter tabs

| Tab | Tokens | Notes |
|---|---|---|
| Records | `table:` `record:` `text:` | `text:` searches the schema's searchable fields (LIKE) |
| Content elements | `ce:` | CTypes incl. custom ones, icons from TCA |
| Activity | `updated:` `created:` `by:` | Effective change date incl. content; `by:` via sys_history |
| Page type | `doktype:` | Custom doktypes appear automatically |
| Page state | `is:` | `empty` `restricted` `hidden` `timed` `editlocked` |
| Translations | `untranslated:` | Page-level translation gaps |
| SEO | `seo:` | Only registered when EXT:seo is installed |

`site:<identifier>` scopes any filter to one site. Favorites are stored per
backend user. Configuration: extension settings (global) and User TSconfig
`tx_pagetreefacets.disableTabs` / `tx_pagetreefacets.disable` (per user/group).

## Extending: register your own tab

Every built-in tab registers through the same public event — there is no
private shortcut. Third parties do exactly the same:

```php
use KonradMichalik\PagetreeFacets\Event\RegisterFilterTabsEvent;
use TYPO3\CMS\Core\Attribute\AsEventListener;

#[AsEventListener]
final class RegisterMyTab
{
    public function __construct(private readonly MyStatusTab $tab) {}

    public function __invoke(RegisterFilterTabsEvent $event): void
    {
        $event->addTab($this->tab); // optional int priority as 2nd argument
    }
}
```

Implement `KonradMichalik\PagetreeFacets\Api\FilterTabInterface`: own one or
more token keys, resolve tokens to page UID lists, and describe the modal UI
declaratively (`checkbox-group`, `select`, `radio-presets`, `text` — no
JavaScript required).

## Known limitations & assumptions (v1)

- **Freetext + tokens:** freetext is resolved against the pages `searchFields` (LIKE) plus numeric UID match and AND-intersected with token results. The core's own LIKE parts are neutralized because they were built against the full token phrase.
- **`searchParts`/`searchUids` semantics:** verified — the core combines them as `WHERE base AND ($searchParts OR uid IN ($searchUids))`. The engine runs after the core listeners (`after: page-tree-wildcard-alias-filter`), overwrites `$searchUids` with its intersection result and neutralizes the core LIKE parts (`PageTreeFilterListener::applyResult()`).
- **`by:`** covers page-record edits only (via `sys_history`); content-element edits do not surface the page. **`text:`** targets `tt_content` unless refined per-table (M3).
- **Toolbar button:** injected next to the tree filter input via capped retry — the single deliberate DOM coupling (no core extension point exists).

## Status

- [x] Token grammar, parser, serializer (unit-tested)
- [x] Filter engine: AND intersection, site scope, config layers (unit-tested with test doubles)
- [x] 7 built-in tabs, modal with vertical navigation, favorites, hotkey
- [x] **M1 spike done:** `BeforePageTreeIsFilteredEvent` verified against TYPO3 v14.3 — corrected event namespace (`Tree\Repository`) and constructor (`+QueryBuilder`), confirmed OR combination, listener ordered after the core listeners, and adapted `text:`/freetext search to the v14 `SearchableSchemaFieldsCollector` (`ctrl.searchFields` was removed in v14)
- [x] 39 unit tests + 37 functional tests green (`composer test:unit`, `composer test:functional`; sqlite by default)
- [ ] Manual smoke test in DDEV (toolbar injection, hotkey, modal round trip)
- [ ] CI wiring (reusable workflows), TER release

## License

GPL-2.0-or-later — Konrad Michalik, [konradmichalik.dev](https://konradmichalik.dev)
