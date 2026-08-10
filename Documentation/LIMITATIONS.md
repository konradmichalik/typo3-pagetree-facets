# Known Limitations & Assumptions

- **Scopes are applied as a post-filter.** `site:<identifier>` and `under:<uid>`
  do not restrict the query up front; they filter the already-matched UID set by
  resolving each page's rootline. This is intentional: it avoids materializing a
  whole site/subtree, and is cheap for the narrow result sets a token filter
  normally produces. A very broad single criterion combined only with a scope
  (e.g. `is:empty site:main` on an installation with thousands of empty pages)
  resolves one rootline per matched page; pair it with a narrower criterion if it
  ever feels slow.
- **`layout:` matches the layout set on the page itself, not the effective one.**
  A page that leaves `backend_layout` empty and only inherits a parent's
  `backend_layout_next_level` is not a match. Resolving inheritance would mean
  walking the rootline for every candidate page, which does not scale on large
  trees. `backend_layout_next_level` has no token of its own: "what this page
  uses" and "what this page hands down" are separate questions, and one token
  answering both would make a hit ambiguous. The layouts offered in the modal are
  collected from every site root (plus the global level) and deduplicated, so
  layouts defined only in the page TSconfig of a *subtree* below a site root do
  not appear as options; the token still matches them if you type it.
  `pagelayout:` is the same facet's second criterion and matches the frontend
  layout field (`pages.layout`) instead; its `0` ("Default") is the column
  default and therefore offered as no checkbox, though `pagelayout:0` still
  resolves if typed.
- **Page permissions are enforced by the core, not this extension.** Facets resolve
  page UIDs installation-wide; the core page tree then intersects that set with
  the backend user's `PAGE_SHOW` permission clause and mount points, so the tree
  never reveals pages the user may not see.
- **Freetext combined with a token is resolved by this extension, not the core.**
  Pure freetext (no `key:` prefix) is handed to the core unchanged, so it keeps the
  full core behaviour: title/`nav_title`, translated titles and frontend-URI
  resolution. Once a freetext word shares the phrase with a keyed token (e.g.
  `doktype:1 home`), the extension resolves it itself so it can intersect it with
  the other criteria: a `LIKE` across all searchable `pages` fields plus a numeric
  UID match. That set is broader than the core's title/`nav_title` search but does
  **not** cover translated titles or `http(s)://` frontend URIs; search for those
  on their own, without a token.
