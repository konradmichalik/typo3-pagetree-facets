<div align="center">

![Extension icon](Resources/Public/Icons/Extension.png)

# TYPO3 extension `typo3_pagetree_facets`

[![Latest Stable Version](https://typo3-badges.dev/badge/typo3_pagetree_facets/version/shields.svg)](https://extensions.typo3.org/extension/typo3_pagetree_facets)
![TYPO3](https://img.shields.io/badge/TYPO3-13.4%20%7C%2014.3-orange.svg)
![PHP](https://img.shields.io/badge/PHP-8.2%20%7C%208.3%20%7C%208.4%20%7C%208.5-blue.svg)
[![CGL](https://img.shields.io/github/actions/workflow/status/konradmichalik/typo3-pagetree-facets/cgl.yml?label=cgl&logo=github)](https://github.com/konradmichalik/typo3-pagetree-facets/actions/workflows/cgl.yml)
[![Coverage](https://coveralls.io/repos/github/konradmichalik/typo3-pagetree-facets/badge.svg?branch=main)](https://coveralls.io/github/konradmichalik/typo3-pagetree-facets)
[![Tests](https://img.shields.io/github/actions/workflow/status/konradmichalik/typo3-pagetree-facets/tests.yml?label=tests&logo=github)](https://github.com/konradmichalik/typo3-pagetree-facets/actions/workflows/tests.yml)
[![License](https://img.shields.io/github/license/konradmichalik/typo3-pagetree-facets)](LICENSE.md)

</div>

This extension turns the TYPO3 backend page tree into a faceted filter. Instead
of scrolling through a large tree, you narrow it down to exactly the pages you
care about: by content type, page state, records, activity, translations or SEO.

Filters are compact tokens that you can type into the tree's existing search
field or assemble in a guided modal, and the whole feature is extensible through
a public facet API.

<div align="center">

![Filter modal](.github/assets/filter-modal.png)

</div>

> [!NOTE]
> Ever scrolled an entire page tree looking for the one page with that content
> element on it? Or the handful of empty pages nobody ever cleaned up? The core
> search only matches page titles and UIDs, so it can't answer either question.
> This extension can, right in the same tree you already know.

## ✨ Features

- **Filterable page tree**: type tokens into the tree's search field, or open a guided modal with <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>
- **Nine built-in filter facets** (SEO requires EXT:seo, Forms requires EXT:form): content elements, records, activity, page type, layouts, page state, translations, SEO and forms, plus `site:` / `under:` scope tokens
- **Sharable links, session persistence and favorites**: hand a filter to a colleague, keep it across a reload, or save it under a name
- **Live match count**: see how many pages a selection would match before applying, right in the filter modal (opt-out via `livePreviewCount`)
- **Extensible**: add a single option to an existing facet, or a whole facet of your own
- **Per-user/group control**: disable facets installation-wide or via User TSconfig
- **Raw query escape hatch** (`raw:`, opt-in): match arbitrary `field=value` conditions against any TCA table the user may already read

## 🔥 Installation

### Requirements

* TYPO3 ^13.4 || ^14.3
* PHP 8.2 - 8.5

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
field) to open the filter modal. Pick criteria by clicking through the facets on
the left; each selection appears as a removable chip above the tree, with a
per-facet count of matching pages, and narrows the tree live as you go.

![How the filter modal works](.github/assets/screencast.gif)

Prefer typing? Every filter is also a compact token that lands directly in the
tree's existing search field, e.g. `doktype:1 is:empty`. See [Usage](Documentation/USAGE.md)
for the full token syntax, the facet/token-key table, and how this differs from
the global backend search.

## 📚 Documentation

| Topic | What's inside |
|---|---|
| [Usage](Documentation/USAGE.md) | Token syntax, the Token view toggle, every built-in facet's token keys, and scope tokens |
| [Configuration](Documentation/CONFIGURATION.md) | Extension settings, the `raw:` power-user token, and per-user/group control via User TSconfig |
| [Known Limitations](Documentation/LIMITATIONS.md) | Scopes as a post-filter, layout inheritance, page permissions, and freetext-with-token search behaviour |
| [Extending](Documentation/EXTENDING.md) | The two extension points, the `example_tab` fixture, and the public API / stability promise |

## 💎 Credits

This project is inspired by the great [pagetreefilter](https://github.com/christophlehmann/pagetreefilter) extension.

## 🧑‍💻 Contributing

Please have a look at [`CONTRIBUTING.md`](CONTRIBUTING.md).

## ⭐ License

This project is licensed under [GNU General Public License 2.0 (or later)](LICENSE.md).
