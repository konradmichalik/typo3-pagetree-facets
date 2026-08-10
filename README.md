<div align="center">

![Extension icon](Resources/Public/Icons/Extension.png)

# TYPO3 extension `typo3_pagetree_facets`

[![Latest Stable Version](https://typo3-badges.dev/badge/typo3_pagetree_facets/version/shields.svg)](https://extensions.typo3.org/extension/typo3_pagetree_facets)
![TYPO3](https://img.shields.io/badge/TYPO3-14.3-orange.svg)
![PHP](https://img.shields.io/badge/PHP-8.3%20%7C%208.4%20%7C%208.5-blue.svg)
[![CGL](https://img.shields.io/github/actions/workflow/status/konradmichalik/typo3-pagetree-facets/cgl.yml?label=cgl&logo=github)](https://github.com/konradmichalik/typo3-pagetree-facets/actions/workflows/cgl.yml)
[![Coverage](https://img.shields.io/coverallsCoverage/github/konradmichalik/typo3-pagetree-facets?logo=coveralls)](https://coveralls.io/github/konradmichalik/typo3-pagetree-facets)
[![Tests](https://img.shields.io/github/actions/workflow/status/konradmichalik/typo3-pagetree-facets/tests.yml?label=tests&logo=github)](https://github.com/konradmichalik/typo3-pagetree-facets/actions/workflows/tests.yml)
[![License](https://img.shields.io/github/license/konradmichalik/typo3-pagetree-facets)](LICENSE.md)

</div>

This extension turns the TYPO3 backend page tree into a faceted filter. Instead
of scrolling through a large tree, you narrow it down to exactly the pages you
care about: by content type, page state, records, activity, translations or SEO.

Filters are compact tokens that you can type into the tree's existing search
field or assemble in a guided modal, and the whole feature is extensible through
a public filter tab API.

<div align="center">

![Filter modal](.github/assets/filter-modal.png)

</div>

## ✨ Features

- **Filterable page tree** — type tokens into the tree's search field, or open a guided modal with <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>
- **Eight built-in filter tabs** — content elements, records, activity, page type, layouts, page state, translations and SEO, plus `site:` / `under:` scopes
- **Sharable links, session persistence and favorites** — hand a filter to a colleague, keep it across a reload, or save it under a name
- **Extensible** — add a single option to an existing tab, or a whole tab of your own
- **Per-user/group control** — disable tabs installation-wide or via User TSconfig
- **Raw query escape hatch** (`raw:`, opt-in) — match arbitrary `field=value` conditions against any TCA table the user may already read

## 🔥 Installation

### Requirements

* TYPO3 ^14.0
* PHP 8.3 - 8.5

### Composer

[![Packagist](https://img.shields.io/packagist/v/konradmichalik/typo3-pagetree-facets?label=version&logo=packagist)](https://packagist.org/packages/konradmichalik/typo3-pagetree-facets)
[![Packagist Downloads](https://img.shields.io/packagist/dt/konradmichalik/typo3-pagetree-facets?color=brightgreen)](https://packagist.org/packages/konradmichalik/typo3-pagetree-facets)

``` bash
composer require konradmichalik/typo3-pagetree-facets
```

### TER

[![TER version](https://typo3-badges.dev/badge/typo3_pagetree_facets/version/shields.svg)](https://extensions.typo3.org/extension/typo3_pagetree_facets)
[![TER downloads](https://typo3-badges.dev/badge/typo3_pagetree_facets/downloads/shields.svg)](https://extensions.typo3.org/extension/typo3_pagetree_facets)

Download the zip file from [TYPO3 extension repository (TER)](https://extensions.typo3.org/extension/typo3_pagetree_facets).

## 📖 How it works

Press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> (or use the toolbar button next to the tree's search
field) to open the filter modal. Pick criteria by clicking through the tabs on
the left; each selection appears as a removable chip above the tree, with a
per-tab count of matching pages, and narrows the tree live as you go.

Prefer typing? The **Token view** toggle (top bar) swaps the freetext field for the
full filter phrase, kept in two-way sync with the form — edit either side and the
other follows. Note that editing the form re-serialises the phrase, so tokens the
form cannot represent survive only while you stay in the field.

![How the filter modal works](.github/assets/screencast.gif)

Under the hood, every filter is a compact token that lands in the tree's
existing search field, so you can also skip the modal and type directly:

```
doktype:1 is:empty                # standard pages without content
table:tx_news_domain_model_news   # pages containing news records
ce:uploads updated:<30d           # pages with an uploads CE, touched last 30 days
seo:missing-description           # indexable pages without meta description
```

Whitespace means AND, a comma means OR within one criterion (`doktype:1,4`).
Freetext without a `key:` prefix behaves like the core title/UID search, and
unknown tokens are ignored.

| Tab | Token keys |
|---|---|
| Content elements | `ce:` |
| Records | `table:` `record:` `text:` |
| Activity | `updated:` `created:` `by:` `createdby:` |
| Page type | `doktype:` |
| Layouts | `layout:` `pagelayout:` |
| Page state | `is:` |
| Translations | `untranslated:` `translated:` |
| SEO (requires EXT:seo) | `seo:` |
| Scopes | `site:<identifier>` `under:<uid>` |

> [!IMPORTANT]
> Every criterion resolves to **pages**, whatever it matches on. `ce:uploads` or
> `table:tx_news_domain_model_news` do not list content elements or news records —
> they narrow the tree to the pages those records live on. The result of a filter
> is always a set of pages.

Matching pages are marked in the tree with a narrow colour stripe — the same one
the core's own title search uses. A filtered tree shows the matches *plus the
branches leading down to them*, so the stripe is what tells an actual hit from a
parent that is only there to hold it. Hover a node to read the reason in its
tooltip.

> [!NOTE]
> This is not the global backend search (the toolbar magnifier / <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>).
> That one finds individual records, pages and modules and jumps you to them; this
> extension narrows the **page tree** to the pages matching structured criteria.
> Two different jobs — use the toolbar search to locate one thing, this to reshape
> the tree.

## ⚙️ Configuration

### Extension settings

You can find the extension settings in the TYPO3 backend under
`Admin Tools > Settings > Extension Configuration > typo3_pagetree_facets`.

| Setting | Default | Description |
|---|---|---|
| `adminOnly` | `0` | Only administrators can use the filter modal and tokens. |
| `disabledFacets` | *(empty)* | Comma-separated list of built-in facet identifiers to disable installation-wide. |
| `persistFilter` | `0` | Remember each backend user's current page tree filter for their session, so it survives a reload or module switch (cleared on logout). |
| `emptyResultNotice` | `1` | Show a hint below the page tree when a filter matches nothing, offering to adjust or reset it. |
| `enableRawQueryTab` | `0` | Enable the `raw:` power-user token (see below). Off by default. |

Built-in facet identifiers: `records`, `ce`, `activity`, `doktype`, `layout`, `state`,
`translations`, `seo`, `raw` (only registered at all when `enableRawQueryTab` is on).

> [!NOTE]
> Disabling a facet also makes its token keys unknown to the filter engine, so the
> restriction cannot be bypassed by typing the token into the search field manually.

> [!NOTE]
> The Activity tab's "Edited by" / "Created by" picker searches backend user
> names. For non-admins this requires `be_users` among the group's allowed
> tables (*Tables (listing)* / `tables_select`) — without that grant the picker
> offers no suggestions (filtering by a known uid, e.g. `by:3`, still works).

#### The `raw:` power-user token

Syntax: `raw:<table>|<field>=<value>|<field2>=<value2>...`, e.g.
`raw:tt_content|CType=image|hidden=0` (`*` for LIKE matching). Off by default —
it matches arbitrary fields on any table the current backend user can already
select records from, so review your backend groups' table permissions before
enabling it.

Field names are whitelisted against the table's TCA `columns`, plus `uid`, which
has no `columns` entry but is the most obvious thing to look a record up by:
`raw:tt_content|uid=201` narrows the tree to the page holding that element.
Unknown field names are dropped rather than matched.

### User TSconfig

Both restrictions can also be applied per backend user or group:

``` typoscript
# Disable the extension entirely for this user/group
tx_typo3pagetreefacets.disable = 1

# Disable individual facets (merged with the disabledFacets extension setting)
tx_typo3pagetreefacets.disableFacets = seo, translations
```

## ⚠️ Known limitations & assumptions

- **Scopes are applied as a post-filter.** `site:<identifier>` and `under:<uid>`
  do not restrict the query up front; they filter the already-matched UID set by
  resolving each page's rootline. This is intentional — it avoids materializing a
  whole site/subtree — and is cheap for the narrow result sets a token filter
  normally produces. A very broad single criterion combined only with a scope
  (e.g. `is:empty site:main` on an installation with thousands of empty pages)
  resolves one rootline per matched page; pair it with a narrower criterion if it
  ever feels slow.
- **`layout:` matches the layout set on the page itself, not the effective one.**
  A page that leaves `backend_layout` empty and only inherits a parent's
  `backend_layout_next_level` is not a match. Resolving inheritance would mean
  walking the rootline for every candidate page, which does not scale on large
  trees. `backend_layout_next_level` has no token of its own — "what this page
  uses" and "what this page hands down" are separate questions, and one token
  answering both would make a hit ambiguous. The layouts offered in the modal are
  collected from every site root (plus the global level) and deduplicated, so
  layouts defined only in the page TSconfig of a *subtree* below a site root do
  not appear as options — the token still matches them if you type it.
  `pagelayout:` is the same tab's second criterion and matches the frontend
  layout field (`pages.layout`) instead; its `0` ("Default") is the column
  default and therefore offered as no checkbox, though `pagelayout:0` still
  resolves if typed.
- **Page permissions are enforced by the core, not this extension.** Tabs resolve
  page UIDs installation-wide; the core page tree then intersects that set with
  the backend user's `PAGE_SHOW` permission clause and mount points, so the tree
  never reveals pages the user may not see.
- **Freetext combined with a token is resolved by this extension, not the core.**
  Pure freetext (no `key:` prefix) is handed to the core unchanged, so it keeps the
  full core behaviour — title/`nav_title`, translated titles and frontend-URI
  resolution. Once a freetext word shares the phrase with a keyed token (e.g.
  `doktype:1 home`), the extension resolves it itself so it can intersect it with
  the other criteria: a `LIKE` across all searchable `pages` fields plus a numeric
  UID match. That set is broader than the core's title/`nav_title` search but does
  **not** cover translated titles or `http(s)://` frontend URIs — search for those
  on their own, without a token.

## 🔌 Extending

There are two extension points, and the smaller one is usually the one you want:

- **A single option in an existing facet** — one more value under a token key that
  already exists, e.g. another checkbox in Page state's `is:` group:
  `FilterOptionInterface` + `RegisterFilterOptionsEvent`.
- **A whole facet** — own token keys, own modal UI:
  `FacetInterface` + `RegisterFacetsEvent`.

The built-ins use the exact same two paths; there is no private shortcut.

**→ [`example_tab`](Tests/Functional/Fixtures/Extensions/example_tab/README.md)**
is a minimal extension in this repository that exercises both, commented method by
method. Its README walks through the interfaces, the priority semantics and what
counts as public API.

## 🔒 Public API & stability

This is a `0.x` release: **the public API surface below may still break between
minor versions.** Pin an exact version (`konradmichalik/typo3-pagetree-facets:0.1.0`,
not `^0.1`) if that matters to you; a `1.0.0` tag, once cut, is what switches this to
semver-strict breaking-changes-only-on-major.

Public (implement/consume freely, changes get a note in the release):

- `FacetInterface`, `RegisterFacetsEvent` — a whole facet: own token keys, own modal UI
- `FilterOptionInterface`, `RegisterFilterOptionsEvent` — a single value inside an
  existing vocabulary facet's token key
- `FilterContext`, `Token` — the value objects passed across both extension points
- The modal field-descriptor shape returned by `getModalConfiguration()`
- `getIdentifier()` (facets) and `getTokenKey()`+`getValue()` (options) as
  administrator-facing identifiers — used in `disabledFacets`/`disableFacets`,
  `disabledOptions`/`disableOptions` and favorites
- The token grammar itself (`key:value`, comma-separated OR-alternatives, freetext)

Explicitly **not** public — change without notice, do not depend on internals:

- `Classes/Service/*`, `Classes/Tab/*`, `Classes/Option/*`, `Classes/EventListener/*`
- The JavaScript modules under `Resources/Public/JavaScript/`

## 🙏 Acknowledgments

This project is inspired by the great [pagetreefilter](https://github.com/christophlehmann/pagetreefilter) extension.

## 🧑‍💻 Contributing

Please have a look at [`CONTRIBUTING.md`](CONTRIBUTING.md).

## ⭐ License

This project is licensed under [GNU General Public License 2.0 (or later)](LICENSE.md).
