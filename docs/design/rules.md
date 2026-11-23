# Design rules

These rules are binding for every change to the filter modal and the page tree toolbar button that opens it. When a change needs to break one, change the rule here first, in the same pull request, and say why.

The screens these rules produce are listed in [screens.md](screens.md).

## Principles

1. **Part of the backend, not a guest in it.** The modal looks and behaves like core: core colours, core buttons, core modal chrome. Nothing has to be learnt that the backend does not already teach.
2. **Every pixel of the filter resolves to pages.** Labels, help and empty states say what the result is: a set of pages, never records or elements.
3. **One place per job.** One field for page titles, one search for criteria, one row that lists what is picked, one button that applies. No control exists twice.
4. **Pick first, apply once.** Picking never changes the tree. The footer always says whether the selection is applied, and Apply is the only way to apply it.
5. **No extra query for decoration.** The live count is the only request a selection triggers. Everything else the modal shows comes from the configuration loaded when it opens.

## Platform constraints

These are facts of the TYPO3 Modal API in v13.4 and v14.3. A design that needs more than this is not built.

| Part | What we control |
| --- | --- |
| Header | Nothing beyond the title string. The brand icon is prepended into `.t3js-modal-title`, nothing else goes there. v13 has no `hideHeader`, so a custom header is not an option |
| Body | Everything. It is our own DOM inside `Modal.advanced({ content })` |
| Footer buttons | Text, icon, `btnClass` and `name` through `Modal.advanced({ buttons })`. Enabled state is set on the button found by its `name`. The label stays static: core owns the button content |
| Footer status | Our own element, prepended into `.t3js-modal-footer` once the modal is shown |
| Size | `Modal.sizes.large` |

## Colour

All colours come from core CSS variables that exist in both v13 and v14 and already switch between light and dark. The stylesheet defines no literal colours and no dark mode block of its own.

| Use | Variable |
| --- | --- |
| Text | `--typo3-text-color-base` |
| Secondary text, meta, group headings | `--typo3-text-color-variant` |
| Field and chip-row background | `--typo3-component-bg` |
| Control and separator borders | `--typo3-component-border-color` |
| Dashed border of the scope chip | `--typo3-text-color-variant`. The component border is a faint mix of surface and text (`--typo3-border-mix`) and does not reach the 3:1 that 1.4.11 asks of this border; the secondary text colour does in both schemes |
| Hover | `--typo3-component-hover-bg` |
| Selected navigation item, chip, selected option row | A tint of `--typo3-state-primary-bg` via `color-mix()` (16%, 26% for the count badge) with `--typo3-text-color-base` |
| Focus ring | `--typo3-component-focus-color` |
| Solid accent (toolbar badge, Apply) | `--typo3-state-primary-bg` with `--typo3-state-primary-color` |
| Token keys (the phrase in text mode, the suggestions, the help) | `--typo3-text-color-code`, core's own colour for code. The primary measures 1.3:1 on the dark field |
| Not applied yet | `--typo3-state-warning-bg` |
| No matching pages | `--typo3-state-danger-bg` |
| Panel and navigation surface | `--typo3-surface-base`, `--typo3-surface-container-low` |

- **The accent is core's primary.** The active navigation item, the badge, the checked box and the Apply button share one colour. No private blue next to core's violet.
- **No coloured text on a tint.** `--typo3-component-active-bg` is the solid primary, not a tint, and the primary in dark mode is too dark to carry text on a dark surface. Selected items keep the base text colour and are told apart by the tint, not by a text colour.
- **Status is never colour alone.** The footer dot always comes with words: `1 matching page · not applied to the tree yet`, `No matching pages`.
- **Icons come from the core icon registry** (`decorativeIcon()`), never inline SVG or emoji.

## Typography

- Core's font stack, and four sizes that hang off core's own (`--typo3-font-size` is 12px, `--typo3-font-size-small` 11px in the backend). They are the `--pf-text-*` tokens, no declaration uses another value:

| Token | Size | Used for |
| --- | --- | --- |
| `--pf-text-title` | 16px, 600 | Panel title, search heading, help title |
| `--pf-text-heading` | 13px | Group and field headings, result group titles, popover titles |
| `--pf-text-base` | 12px | Everything read or clicked: options, navigation items, chips, descriptions, hints, buttons, inputs |
| `--pf-text-small` | 11px | Uppercase group captions, counts, reasons under a navigation item, key hints, labels such as `Disabled` |

- Core's `.form-control-sm` and `.btn-sm` fall back to the small step, so they are set to the base step explicitly. Nothing in the modal is smaller than the options next to it unless it is a caption or a meta line.
- Group headings in the navigation are uppercase, 11px, letter spacing `0.06em`.
- A heading with a checkbox centres the box on the name, whatever height the row has for touch.
- A monospace font only for tokens: the phrase in text mode, keys and values in suggestions and in the help.

## Layout

| Element | Value |
| --- | --- |
| Navigation width | 240px, scrolls on its own |
| Navigation item | 32px high, 42px with a reason line |
| Search field | 36px high |
| Criteria row | 40px minimum, two rows of chips at most |
| Chip | 26px high, at most 300px wide |
| Option row | 40px for up to 15 options in a field, 32px in three columns above that |
| Footer status gap to buttons | 10px |
| Touch and click targets | 24px minimum, also for the × on a chip |

## Toolbar

The area between the modal header and the body holds exactly two rows.

### Search field

- One field, placeholder `Page title or UID`. It searches pages, nothing else.
- The Text switch sits inside the field at its trailing edge, as a labelled button with the code icon and the word `Text`. Never an icon alone.
- In text mode the same field shows the whole phrase. The switch reads `Text` and is pressed (`aria-pressed="true"`).

### Criteria row

Left to right:

1. The scope chip `In: Whole tree`, a button with a chevron and a dashed border so it does not read as a removable criterion. It opens one list: `Whole tree`, `Below "<page title>" [<uid>]` when a page is open, then one entry per site when there is more than one site. Without an open page and with a single site the chip is not rendered.
2. One chip per picked value, in the order the criteria appear in the navigation: `<Facet>: <value>` with a × button whose accessible name is `Remove <Facet>: <value>`. The freetext is a chip too: `Title: <text>`.
3. `Clear all`, a text button. It replaces the former footer button Reset.
4. The actions menu `⋯` (`aria-label="More actions"`, the `role="menu"` panel is labelled by it) with `Save as favorite` and `Copy link to this filter`. The glyph is core's `actions-menu-alternative` (three dots, stacked), since the registry has no horizontal one. `Save as favorite` opens the name form inline under the row.

Rules for the row:

- **Two rows at most.** The number of visible chips is measured with a `ResizeObserver`, never clipped with CSS. The rest is collected in `+N more`, which opens a popover listing every criterion grouped by facet, each removable, plus `Clear all`. No chip is ever cut off.
- **A long value is shortened, the facet prefix is not.** The value gets the ellipsis, the chip's `title` holds the full text.
- **Empty state:** with nothing picked the row has a dashed border and reads `Nothing picked yet. Choose a category on the left or type a page title above.` Clear all and the actions menu are not rendered. No random hints.
- In text mode the row is replaced by the short reference (see Text mode), because the phrase already lists every criterion.

## Navigation

- Order: the criterion search, `Favorites` with its count when favorites exist, then the facet groups in priority order, each under its uppercase heading.
- The active facet carries a 3px start border in the base text colour besides its tint. The tint alone is a weak cue and is dropped in forced-colors mode, a border is not. The label does not shift: the item's start padding shrinks by the border width. In forced-colors mode a transparent border is painted too, so there the inactive items drop the border and take its width back as padding.
- A facet with criteria picked shows a badge with the number: the 26% tint of `--typo3-state-primary-bg` with the base text colour, as in the Colour table.
- A facet without options is disabled and says why on a second line in the item itself, for example `Site has only one language`. Never only in a `title` tooltip.
- `How filtering works` is the last item, pinned to the bottom edge of the navigation with a separator line. It stays visible however many facets third parties register.
- Arrow keys, Home and End move between items as today (roving tab stop, automatic activation).

## Panel

- A heading with the facet name, one sentence below it that says what the facet matches (`Show pages of the selected types. Several choices mean any of them.`), and `Select none` on the right once something is picked.
- **Multiple choice is a checkbox,** not a switch. A switch promises an immediate effect, and nothing here takes effect before Apply.
- **Single choice is a radio group whose first option is `Any time`** (or the facet's equivalent neutral value). Its value is empty and it is never a criterion, so it is never a chip.
- A field with more than 15 options uses 32px rows in three columns; the heading row and the group headings stay visible while the list scrolls (`position: sticky`), and the heading shows `<n> of <total> selected`.
- A field with groups (content element types) gets a group checkbox in each group heading that selects or clears that group.
- **No search inside a panel.** The criterion search in the navigation covers every option of every facet.
- Third-party facets get all of this from `getModalConfiguration()`. A new field type is added in `Resources/Public/JavaScript/Filter/fields.js` only.

## Criterion search

- While the navigation search has text, the panel shows the matches instead of a facet. Matches are grouped by `<Facet> › <Field>`, the matched part is marked, the heading reads `<n> criteria match “<query>”` and is a polite live region.
- The navigation shows the number of matches per facet; facets without a match use `--typo3-text-color-variant`.
- `Show all in <Facet>` opens that facet. `Esc` or the × in the field clears the search and returns to the facet that was open.
- A match row is a proxy for the real control, as today: checking it checks the original.
- A line under the matches says what the search does not cover: `Only the criteria are searched here. To find a page by its title, use the field at the top.`

## Text mode

- The phrase is highlighted: the key and its colon in core's code colour (see Colour, the primary fails 4.5:1 in dark mode), the value in the text colour, one `ch` between tokens. The phrase shows the spacing as typed; the serializer writes one space.
- The short reference replaces the criteria row: `key:value one criterion`, `space all must match`, `1,3 any of these`, `Text without key searches title and UID`, and a link to the help.
- Suggestions open under the field: first the keys, after a colon the values of that key, each with its label. They come from the configuration loaded on open. No counts.
- The form below stays usable and in sync in both directions, as today.

## Autocomplete for users

- `Me (<username>)` is always the first entry and needs no request.
- A search starts at two characters, 300 ms after the last key, and returns at most 20 users matched on username and real name.
- The matched part of each result is marked. Disabled accounts stay in the list with a `Disabled` label, because pages they edited are still found.
- The picked user is a chip inside the field with its own ×.
- Below two characters the list says `Type one more character to search users`, with no match `No user matches '<query>'`. `Me` stays selectable in both.

## Footer

- Left: the status line. Its live region (`role="status"`, `aria-live="polite"`) holds the live count and whether the selection is applied: `14 matching pages · not applied to the tree yet`. While counting it shows a placeholder bar instead of the number, the layout does not move.
- Right: `Cancel` (`btn-default`), then `Apply` (`btn-primary`, check icon), the primary action last as in core. Apply is disabled while the selection equals the applied filter.
- No Reset button in the footer. Clearing lives in the criteria row.
- While nothing is picked the status shows the shortcut instead: `Tip: open this dialog from anywhere with Ctrl Shift L` (`Cmd` on macOS). The tip sits beside the live region, not inside it, so its return is never announced.

## No matching pages

- When the count is 0 a warning callout appears under the criteria row: `No page matches all <n> criteria`, then `Every criterion has to match at once. Remove one with its × above, or widen it in its category. The count below updates right away.`
- It has no buttons of its own. The chips above already remove criteria.
- Apply stays possible.

## Leaving with a pending selection

- Closing with a selection that is not applied asks once, in a core `Modal.confirm` with `SeverityEnum.warning`.
- Buttons left to right: `Keep editing` (`btn-default`), `Discard selection` (`btn-default`), `Apply and close` (`btn-primary`). No warning-coloured button: discarding a filter loses nothing that cannot be picked again.

## Help

- One popover, opened from `How filtering works`, placed next to the navigation over the content. It never pushes the content down.
- Sections: combining criteria (with the or/and illustration), nothing changes until Apply, keep and share (the actions menu), prefer typing (Text and five example tokens), and the difference to the global search: `Looking for one record itself? The Records category here only narrows the tree to pages that contain such records. To open a record directly, use the global backend search: Ctrl K`.
- Every example token in the help exists in the code.

## Performance

- The live count is the only request that follows a change: one request, debounced by 350 ms, behind the `livePreviewCount` setting.
- No count per option, per suggestion or per removable criterion. Each one would be a full filter run, plus one rootline per match when a scope is set ([LIMITATIONS.md](../../Documentation/LIMITATIONS.md)).
- Options, keys, values, empty facets and search matches are derived in the browser from the configuration response.
- The user search is the only other request, and only from the user picker.

## Accessibility

WCAG 2.2 AA.

| Criterion | Rule |
| --- | --- |
| 1.4.3 Text contrast | 4.5:1 for all text including disabled reasons, meta and placeholders, light and dark |
| 1.4.11 Non-text contrast | 3:1 for control borders, the dashed scope chip, checkboxes and focus |
| 2.1.1 Keyboard | Every action without a pointer: chips, `+N more`, the actions menu, suggestions, the scope list |
| 2.4.7 Focus | Core's focus ring everywhere, also in popovers |
| 2.5.8 Target size | Nothing interactive below 24px |
| 4.1.2 Name, role | Icon-only buttons have an `aria-label`; the scope list and suggestions are listboxes with `aria-activedescendant`; popovers are dialogs with a name |
| 4.1.3 Status messages | The footer status and the search heading are polite live regions |

## Motion

Motion is added only inside `prefers-reduced-motion: no-preference`. Start from no motion and opt in.

| Where | What | Duration |
| --- | --- | --- |
| Count placeholder | Opacity pulse | 1.2 s, repeating |
| Popover | Fade | 120 ms |

Nothing else moves.

## Copy

- The UI is English in `locallang.xlf`, German in `de.locallang.xlf`, unit ids kept in sync. Labels shipped to the client start with `pagetreeFacets.modal.`.
- Sentence case for labels and buttons.
- Fixed names: Filter page tree; Page title or UID; Text; In; Clear all; Save as favorite; Copy link to this filter; Find a criterion; Favorites; How filtering works; Select none; Any time; Cancel; Apply; Keep editing; Discard selection; Apply and close.
- A preset says what it matches for its own field. `Created` presets never reuse the `Last updated` wording (`Untouched for more than 6 months` is wrong for a creation date).

## Pull request checklist

- [ ] Colours come from core variables, no literals and no own dark mode block
- [ ] No new request beyond the live count and the user search
- [ ] Multiple choice is a checkbox, single choice has its neutral first option
- [ ] Nothing in the header beyond the title, nothing dynamic in a footer button label
- [ ] Chips never clipped, the scope chip never removable
- [ ] Light, dark and reduced motion checked in v13 and v14, screenshot in the PR
- [ ] A rule that changed is updated in this file
