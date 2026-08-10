# Extending

There are two extension points, and the smaller one is usually the one you want:

- **A single option in an existing facet**: one more value under a token key that
  already exists, e.g. another checkbox in Page state's `is:` group:
  `FilterOptionInterface` + `RegisterFilterOptionsEvent`.
- **A whole facet**: own token keys, own modal UI:
  `FacetInterface` + `RegisterFacetsEvent`.

The built-ins use the exact same two paths; there is no private shortcut.

**→ [`example_tab`](../Tests/Functional/Fixtures/Extensions/example_tab/README.md)**
is a minimal extension in this repository that exercises both, commented method by
method. Its README walks through the interfaces, the priority semantics and what
counts as public API.

## Public API & stability

This is a `0.x` release: **the public API surface below may still break between
minor versions.** Pin an exact version (`konradmichalik/typo3-pagetree-facets:0.1.0`,
not `^0.1`) if that matters to you; a `1.0.0` tag, once cut, is what switches this to
semver-strict breaking-changes-only-on-major.

Public (implement/consume freely, changes get a note in the release):

- `FacetInterface`, `RegisterFacetsEvent`: a whole facet, own token keys, own modal UI
- `FilterOptionInterface`, `RegisterFilterOptionsEvent`: a single value inside an
  existing vocabulary facet's token key
- `FilterContext`, `Token`: the value objects passed across both extension points
- The modal field-descriptor shape returned by `getModalConfiguration()`:
  ```php
  [
      'fields' => [
          [
              'type' => 'checkbox-group', // | 'select' | 'radio-presets' | 'text' | 'user-picker'
              'name' => 'is',             // maps into serialize()/hydrate() state
              'label' => 'Page state',
              'options' => [              // for choice types
                  ['value' => 'hidden', 'label' => 'Hidden', 'icon' => 'actions-eye-disabled', 'description' => null],
              ],
          ],
      ],
  ]
  ```
  See `FacetInterface::getModalConfiguration()`'s own docblock for the full shape,
  including `currentUser` and `pinned` (both `user-picker`-only).
- `getIdentifier()` (facets) and `getTokenKey()`+`getValue()` (options) as
  administrator-facing identifiers, used in `disabledFacets`/`disableFacets`,
  `disabledOptions`/`disableOptions` and favorites
- The token grammar itself (`key:value`, comma-separated OR-alternatives, freetext)

Explicitly **not** public: subject to change without notice, do not depend on internals:

- `Classes/Service/*`, `Classes/Tab/*`, `Classes/Option/*`, `Classes/EventListener/*`
- The JavaScript modules under `Resources/Public/JavaScript/`
