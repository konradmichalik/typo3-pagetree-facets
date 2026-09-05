# Configuration

## Extension settings

You can find the extension settings in the TYPO3 backend under
`Admin Tools > Settings > Extension Configuration > typo3_pagetree_facets`.

| Setting | Default | Description |
|---|---|---|
| `adminOnly` | `0` | Only administrators can use the filter modal and tokens. |
| `disabledFacets` | *(empty)* | Comma-separated list of built-in facet identifiers to disable installation-wide. |
| `disabledOptions` | *(empty)* | Comma-separated list of `tokenKey:value` pairs to disable a single vocabulary option (e.g. `is:hidden`) installation-wide. |
| `persistFilter` | `0` | Remember each backend user's current page tree filter for their session, so it survives a reload or module switch (cleared on logout). |
| `emptyResultNotice` | `1` | Show a hint below the page tree when a filter matches nothing, offering to adjust or reset it. |
| `livePreviewCount` | `1` | Show a live count of matching pages in the filter modal's footer while criteria are being picked, before "Apply". |
| `enableRawQueryTab` | `0` | Enable the `raw:` power-user token (see below). Off by default. |

Built-in facet identifiers: `records`, `ce`, `activity`, `doktype`, `layout`, `state`,
`translations`, `form`, `seo`, `raw` (only registered at all when `enableRawQueryTab` is on;
`form` and `seo` only when EXT:form / EXT:seo are loaded).

> [!NOTE]
> Disabling a facet also makes its token keys unknown to the filter engine, so the
> restriction cannot be bypassed by typing the token into the search field manually.

<!-- -->

> [!NOTE]
> The Activity facet's "Edited by" / "Created by" picker searches backend user
> names. For non-admins this requires `be_users` among the group's allowed
> tables (*Tables (listing)* / `tables_select`); without that grant the picker
> offers no suggestions (filtering by a known uid, e.g. `by:3`, still works).

## The `raw:` power-user token

Syntax: `raw:<table>|<field>=<value>|...` (`*` for LIKE), e.g.
`raw:tt_content|CType=image|hidden=0`. Off by default: it matches any field on a
table the current backend user can already select records from, so review table
permissions before enabling it. Field names are whitelisted against the table's
TCA `columns` plus `uid` (e.g. `raw:tt_content|uid=201`); unknown fields are
dropped rather than matched.

## User TSconfig

These restrictions can also be applied per backend user or group:

``` typoscript
# Disable the extension entirely for this user/group
tx_typo3pagetreefacets.disable = 1

# Disable individual facets (merged with the disabledFacets extension setting)
tx_typo3pagetreefacets.disableFacets = seo, translations

# Disable individual options (merged with the disabledOptions extension setting)
tx_typo3pagetreefacets.disableOptions = is:hidden
```
