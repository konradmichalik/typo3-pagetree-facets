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

> [!WARNING]
> This package is in early development stage and may change significantly in
> the future. I am working steadily to release a stable version as soon as
> possible.

<div align="center">

![Filter modal](.github/assets/filter-modal.png)

</div>

## ✨ Features

- **Filterable page tree** — type tokens into the tree's search field, or open a guided modal with <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>
- **Seven built-in filter tabs** — content elements, records, activity, page type, page state, translations and SEO, plus `site:` / `under:` scopes
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

> [!NOTE]
> Not yet released to Packagist or TER; install from a VCS repository until the first tagged release.

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
| Page state | `is:` |
| Translations | `untranslated:` `translated:` |
| SEO (requires EXT:seo) | `seo:` |
| Scopes | `site:<identifier>` `under:<uid>` |

> [!IMPORTANT]
> Every criterion resolves to **pages**, whatever it matches on. `ce:uploads` or
> `table:tx_news_domain_model_news` do not list content elements or news records —
> they narrow the tree to the pages those records live on. The result of a filter
> is always a set of pages.

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
| `disabledTabs` | *(empty)* | Comma-separated list of built-in tab identifiers to disable installation-wide. |
| `persistFilter` | `0` | Remember each backend user's current page tree filter for their session, so it survives a reload or module switch (cleared on logout). |
| `emptyResultNotice` | `1` | Show a hint below the page tree when a filter matches nothing, offering to adjust or reset it. |
| `enableRawQueryTab` | `0` | Enable the `raw:` power-user token (see below). Off by default. |

Built-in tab identifiers: `records`, `ce`, `activity`, `doktype`, `state`,
`translations`, `seo`, `raw` (only registered at all when `enableRawQueryTab` is on).

> [!NOTE]
> Disabling a tab also makes its token keys unknown to the filter engine, so the
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

### User TSconfig

Both restrictions can also be applied per backend user or group:

``` typoscript
# Disable the extension entirely for this user/group
tx_typo3pagetreefacets.disable = 1

# Disable individual tabs (merged with the disabledTabs extension setting)
tx_typo3pagetreefacets.disableTabs = seo, translations
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

- **A single option in an existing tab** — one more value under a token key that
  already exists, e.g. another checkbox in Page state's `is:` group:
  `FilterOptionInterface` + `RegisterFilterOptionsEvent`.
- **A whole tab** — own token keys, own modal UI:
  `FilterTabInterface` + `RegisterFilterTabsEvent`.

The built-ins use the exact same two paths; there is no private shortcut.

**→ [`example_tab`](Tests/Functional/Fixtures/Extensions/example_tab/README.md)**
is a minimal extension in this repository that exercises both, commented method by
method. Its README walks through the interfaces, the priority semantics and what
counts as public API.

## 🙏 Acknowledgments

This project is inspired by the great [pagetreefilter](https://github.com/christophlehmann/pagetreefilter) extension.

## 🧑‍💻 Contributing

Please have a look at [`CONTRIBUTING.md`](CONTRIBUTING.md).

The test suite has three layers: PHPUnit (unit + functional), Vitest (JavaScript unit tests,
jsdom), and Playwright (end-to-end, against a running ddev instance):

```bash
ddev exec npm install                          # first time only
ddev exec npx playwright install chromium      # first time only
ddev exec npx playwright test                  # whole E2E suite
ddev exec npx playwright test Tests/Playwright/tests/toolbar.spec.ts
```

## ⭐ License

This project is licensed under [GNU General Public License 2.0 (or later)](LICENSE.md).
