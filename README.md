<div align="center">

![Extension icon](Resources/Public/Icons/Extension.png)

# TYPO3 extension `typo3_pagetree_facets`

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

![Filter modal](.github/assets/filter-modal.jpg)

</div>

| Type a token, or open the modal from the toolbar | The phrase lands back in the search field |
|---|---|
| ![Toolbar search](.github/assets/toolbar-search.jpg) | ![Toolbar with an applied filter](.github/assets/toolbar-filter-applied.jpg) |

## ✨ Features

- **Filterable page tree**: type tokens into the tree's existing search field, or open a modal (`Ctrl/Cmd+Shift+L`) for a guided UI with active-filter chips and per-tab counts
- **Built-in filter tabs**: Content elements (`ce:`), Records (`table:` `record:` `text:`), Activity (`updated:` `created:` `by:` `createdby:`), Page type (`doktype:`), Page state (`is:`), Translations (`untranslated:` `translated:`), SEO (`seo:`, requires EXT:seo)
- **Scopes**: `site:<identifier>` narrows to one site, `under:<uid>` to the page currently open and its subpages
- **Extensible tab API**: register a `FilterTabInterface` implementation via `RegisterFilterTabsEvent`; built-in tabs use the exact same path
- **Per-user/group control**: disable tabs globally (extension settings) or per user/group (`tx_typo3pagetreefacets.disableTabs` / `.disable`)

## 🔥 Installation

### Requirements

* TYPO3 ^14.0
* PHP 8.3 - 8.5

### Composer

``` bash
composer require konradmichalik/typo3-pagetree-facets
```

> [!NOTE]
> Not yet released to Packagist or TER; install from a VCS repository until the first tagged release.

## 🚀 Quick start

Type filter tokens into the backend page tree's search field, or press
`Ctrl/Cmd+Shift+L` to open the modal, to narrow the tree to matching pages:

```
doktype:1 is:empty                # standard pages without content
table:tx_news_domain_model_news   # pages containing news records
ce:uploads updated:<30d           # pages with an uploads CE, touched last 30 days
seo:missing-description           # indexable pages without meta description
```

Whitespace means AND, a comma means OR within one criterion (`doktype:1,4`).
Freetext without a `key:` prefix behaves like the core title/UID search, and
unknown tokens are ignored. The modal mirrors the same tokens: pick criteria by
clicking, see them as removable chips with a per-tab count, and it writes the
phrase back into the search field.

## ⚙️ Configuration

### Extension settings

You can find the extension settings in the TYPO3 backend under
`Admin Tools > Settings > Extension Configuration > typo3_pagetree_facets`.

| Setting | Default | Description |
|---|---|---|
| `adminOnly` | `0` | Only administrators can use the filter modal and tokens. |
| `disabledTabs` | *(empty)* | Comma-separated list of built-in tab identifiers to disable installation-wide. |

Built-in tab identifiers: `records`, `ce`, `activity`, `doktype`, `state`,
`translations`, `seo`.

> [!NOTE]
> Disabling a tab also makes its token keys unknown to the filter engine, so the
> restriction cannot be bypassed by typing the token into the search field manually.

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

## 🔌 Extending

Register a `FilterTabInterface` implementation via `RegisterFilterTabsEvent`
(`#[AsEventListener]`); the built-in tabs use the exact same path. A tab owns
token keys, resolves them to page UIDs, and describes its modal UI declaratively.

A complete, working example lives in this repository:
[`example_tab`](Tests/Functional/Fixtures/Extensions/example_tab) is a minimal
extension adding an `abstract:set` / `abstract:empty` filter, with the interface
contract explained method by method. It is a development fixture (not part of the
released package), so copy it rather than depending on it.

## 🙏 Acknowledgments

This project is inspired by the great [pagetreefilter](https://github.com/christophlehmann/pagetreefilter) extension.

## 🧑‍💻 Contributing

Please have a look at [`CONTRIBUTING.md`](CONTRIBUTING.md).

## ⭐ License

This project is licensed under [GNU General Public License 2.0 (or later)](LICENSE.md).
