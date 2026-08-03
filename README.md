<div align="center">

# 🔍 Pagetree Facets

**Filterable page tree for TYPO3 v14 — with an extensible filter tab API.**

`composer require konradmichalik/typo3-pagetree-facets`

</div>

> [!WARNING]
> **Beta.** Built on the TYPO3 v14 `BeforePageTreeIsFilteredEvent`, verified
> against v14.3. API and documentation will grow once it stabilizes.

## 🎯 What it does

Type filter tokens into the page tree filter field — or press
`Ctrl/Cmd+Shift+F` for the modal:

```
doktype:1 is:empty                # standard pages without content
table:tx_news_domain_model_news   # pages containing news records
ce:uploads updated:<30d           # pages with an uploads CE, touched last 30 days
seo:missing-description           # indexable pages without meta description
```

Whitespace = AND, comma = OR within one criterion (`doktype:1,4`). Freetext
(no `key:`) behaves like the core title/UID search; unknown tokens are ignored.

## 🧩 Built-in filter tabs

| Tab | Tokens |
|---|---|
| Records | `table:` `record:` `text:` |
| Content elements | `ce:` |
| Activity | `updated:` `created:` `by:` |
| Page type | `doktype:` |
| Page state | `is:` |
| Translations | `untranslated:` |
| SEO | `seo:` (requires EXT:seo) |

`site:<identifier>` scopes to one site, `under:<uid>` scopes to one page and its
subpages (the modal offers this as "Search from current page down" whenever a
page is open). Tabs can be disabled globally (extension settings) or per
user/group (`tx_pagetreefacets.disableTabs` / `.disable`).

## 🔌 Extending

Register a `FilterTabInterface` implementation via `RegisterFilterTabsEvent`
(`#[AsEventListener]`) — the built-in tabs use the exact same path. A tab owns
token keys, resolves them to page UIDs, and describes its modal UI declaratively.

## 🚦 Status

Beta. 39 unit + 45 functional tests green (`composer test:unit` /
`composer test:functional`, sqlite by default), manually smoke-tested in DDEV. Pending: CI, TER release.

## 📄 License

GPL-2.0-or-later — Konrad Michalik, [konradmichalik.dev](https://konradmichalik.dev)
