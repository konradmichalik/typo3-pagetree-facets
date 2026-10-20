/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { buildFilterSearchInput } from '@konradmichalik/pagetree-facets/Filter/search-results.js';

/**
 * The vertical navigation: the criterion search, the facet items under their
 * group headings in a list that scrolls on its own, and whatever the modal pins
 * under that list (the help link).
 *
 * A facet without options is disabled and says why on a second line of its
 * item. The modal keeps the active state (see its #switchTab); this module only
 * renders it and moves the roving tab stop with the arrows.
 */

const lang = (key, fallback) => TYPO3.lang?.[key] ?? fallback;

/**
 * A tab is "empty" when every field is a choice type (checkbox-group / select
 * / radio-presets) with zero options - e.g. Translations on a single-language
 * site. Freeform fields (text, user-picker) are always usable regardless of
 * options, so their presence means the tab is never considered empty.
 *
 * @param {{configuration: {fields?: Array<object>}}} tab
 * @returns {boolean}
 */
export function isTabEmpty(tab) {
  const fields = tab.configuration.fields ?? [];
  if (!fields.length) {
    return true;
  }
  const choiceTypes = ['checkbox-group', 'select', 'radio-presets'];
  return fields.every((field) => choiceTypes.includes(field.type) && (field.options ?? []).length === 0);
}

/**
 * @param {{tabs: Array<object>, activeTab: string, leading: HTMLElement, trailing: HTMLElement,
 *   onQuery: (query: string) => void, onActivate: (identifier: string, activated: boolean) => void}} options -
 *   `leading` is the first list item (favorites), `trailing` is pinned under the
 *   list; `onActivate` gets `activated` true for a click, false for an arrow move
 * @returns {HTMLElement}
 */
export function buildNavigation({ tabs, activeTab, leading, trailing, onQuery, onActivate }) {
  const nav = document.createElement('div');
  nav.className = 'col-3 pagetree-facets__nav';
  nav.append(buildFilterSearchInput({ onQuery }));

  // The list is what scrolls, so what is pinned below it stays in view however
  // many facets third parties register.
  const list = document.createElement('ul');
  list.className = 'list-unstyled pagetree-facets__nav-list';
  list.append(leading);
  for (const [group, members] of groupTabs(tabs)) {
    if (group !== '') {
      const heading = document.createElement('li');
      heading.className = 'pagetree-facets__nav-group text-muted text-uppercase';
      heading.textContent = group;
      list.append(heading);
    }
    for (const tab of members) {
      list.append(renderNavItem(tab, activeTab, onActivate));
    }
  }
  list.addEventListener('keydown', (event) => moveWithArrows(event, nav, onActivate));

  // The last item, pinned to the bottom edge with a separator. Not part of the
  // roving walk: it is not a facet, Tab reaches it from the active one.
  const pinned = document.createElement('div');
  pinned.className = 'pagetree-facets__nav-help';
  pinned.append(trailing);
  nav.append(list, pinned);

  return nav;
}

// Tabs arrive priority-ordered, so their groups interleave (content, state,
// content, ...). Bucket them by group first, keeping first-seen order, so each
// group heading is rendered exactly once.
function groupTabs(tabs) {
  const groups = new Map();
  for (const tab of tabs) {
    const key = tab.group ?? '';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(tab);
  }

  return groups;
}

function renderNavItem(tab, activeTab, onActivate) {
  const empty = isTabEmpty(tab);
  const active = tab.identifier === activeTab;
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pagetree-facets__nav-item' + (active ? ' active' : '') + (empty ? ' is-empty' : '');
  button.dataset.tab = tab.identifier;
  button.disabled = empty;
  if (active) {
    button.setAttribute('aria-current', 'true');
  }
  button.tabIndex = active ? 0 : -1;
  // Label text kept in its own node so the active-criteria count can be toggled
  // live without clobbering the label.
  const text = document.createElement('span');
  text.textContent = tab.label;
  button.append(text);
  if (empty) {
    // Why there is nothing to pick, as a second line in the item itself: a
    // disabled button has no hover a tooltip could rely on.
    const reason = document.createElement('span');
    reason.className = 'pagetree-facets__nav-reason';
    reason.textContent = tab.configuration.emptyReason || lang('pagetreeFacets.modal.tabEmpty', 'No options available');
    button.append(reason);
  } else {
    button.addEventListener('click', () => onActivate(tab.identifier, true));
  }
  item.append(button);

  return item;
}

// Roving tabindex: only the active item is a tab stop, so a single Tab out of
// the navigation reaches the panel instead of walking past every remaining tab
// first. Arrows then move within the navigation.
//
// Deliberately NOT role="tablist": that role admits only tabs as children, and
// this navigation interleaves group headings, so claiming it would promise a
// structure we cannot honour. A list of buttons with a roving tab stop is the
// honest description, and arrow support is what makes it usable.
function moveWithArrows(event, nav, onActivate) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (undefined === step && !['Home', 'End'].includes(event.key)) {
    return;
  }
  // Empty tabs are disabled and the favorites item hides itself while there is
  // nothing saved - neither may swallow an arrow press.
  const items = [...nav.querySelectorAll('.pagetree-facets__nav-item')]
    .filter((item) => !item.disabled && true !== item.closest('li')?.hidden);
  if (0 === items.length) {
    return;
  }
  event.preventDefault();
  const current = items.indexOf(event.target.closest('.pagetree-facets__nav-item'));
  const next = 'Home' === event.key
    ? 0
    : ('End' === event.key ? items.length - 1 : (current + step + items.length) % items.length);
  items[next].focus();
  // Automatic activation: the panels are already in the DOM, so switching as
  // the user arrows costs nothing and makes browsing them immediate.
  onActivate(items[next].dataset.tab, false);
}
