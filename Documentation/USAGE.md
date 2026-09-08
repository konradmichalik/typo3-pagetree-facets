# Usage

## Token view

Prefer typing? The **Token view** toggle (top bar of the filter modal) swaps the
freetext field for the full filter phrase, kept in two-way sync with the form:
edit either side and the other follows. Note that editing the form re-serialises
the phrase, so tokens the form cannot represent survive only while you stay in
the field.

## Token syntax

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

## Facets and token keys

Every built-in facet and the token keys it owns:

| Facet | Token keys | Filters by |
|---|---|---|
| Content elements | `ce:` | the CType of content elements on the page |
| Records | `table:` `record:` `text:` | any other record referencing the page |
| Activity | `updated:` `created:` `by:` `createdby:` | when the page changed and who touched it |
| Page type | `doktype:` | the page's doktype |
| Layouts | `layout:` `pagelayout:` | the backend/frontend layout assigned to the page |
| Page state | `is:` | flags such as hidden, empty or editlocked |
| Translations | `untranslated:` `translated:` | translation completeness |
| Forms (requires EXT:form) | `form:` | which TYPO3 Form Framework form is embedded on the page |
| SEO (requires EXT:seo) | `seo:` | SEO metadata issues, e.g. a missing description |
| Raw query (opt-in, see [Configuration](CONFIGURATION.md)) | `raw:` | arbitrary `field=value` conditions on any TCA table |

`site:<identifier>` and `under:<uid>` are not facets: they are special scope
tokens that restrict any of the above to one site or subtree.

Need a criterion that isn't listed? Third parties can register their own facet,
or add a value to an existing one; see [Extending](EXTENDING.md).

> [!IMPORTANT]
> Every criterion resolves to **pages**, whatever it matches on. `ce:uploads` or
> `table:tx_news_domain_model_news` do not list content elements or news records;
> they narrow the tree to the pages those records live on. The result of a filter
> is always a set of pages.

## Not the global search

> [!NOTE]
> This is not the global backend search (the toolbar magnifier / <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>).
> That one finds individual records, pages and modules and jumps you to them; this
> extension narrows the **page tree** to the pages matching structured criteria.
> Two different jobs: use the toolbar search to locate one thing, this to reshape
> the tree.
