/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { lang } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { buildFilterSearchInput } from '@konradmichalik/pagetree-facets/Filter/search-results.js';
import { CHOICE_FIELD_TYPES } from '@konradmichalik/pagetree-facets/Filter/tab-fields.js';

/**
 * The vertical navigation: the criterion search, the facet items under their
 * group headings in a list that scrolls on its own, and the help link pinned
 * under it. The modal keeps the active state, this renders it and moves the
 * roving tab stop with the arrows.
 */

/**
 * Every field is a choice type with no option to pick. A freeform field is always usable.
 *
 * @param {{configuration: {fields?: Array<object>}}} tab
 * @returns {boolean}
 */
export function isTabEmpty(tab) {
  const fields = tab.configuration.fields ?? [];
  if (!fields.length) {
    return true;
  }
  return fields.every((field) => CHOICE_FIELD_TYPES.includes(field.type) && (field.options ?? []).length === 0);
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

/**
 * While the criterion search has text, every facet item shows how many of the
 * matches it holds; a facet without one is dimmed. The criteria badge stays in
 * the DOM underneath, the stylesheet swaps the two.
 *
 * @param {HTMLElement} nav
 * @param {Array<{tab: {identifier: string}}>|null} matches - null leaves search mode
 */
export function showMatchCounts(nav, matches) {
  nav.classList.toggle('is-searching', null !== matches);
  const counts = new Map();
  for (const { tab } of matches ?? []) {
    counts.set(tab.identifier, (counts.get(tab.identifier) ?? 0) + 1);
  }
  for (const item of nav.querySelectorAll('.pagetree-facets__nav-item')) {
    item.querySelector('.pagetree-facets__nav-matches')?.remove();
    const count = counts.get(item.dataset.tab);
    item.classList.toggle('is-unmatched', null !== matches && undefined === count);
    if (undefined !== count) {
      const badge = document.createElement('span');
      badge.className = 'pagetree-facets__nav-matches';
      badge.textContent = String(count);
      item.append(badge);
    }
  }
}

// Tabs arrive priority-ordered, so their groups interleave: bucketing them
// first, in first-seen order, renders each group heading once.
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
  // Its own node, so the count badge can come and go without touching the label.
  const text = document.createElement('span');
  text.textContent = tab.label;
  button.append(text);
  if (empty) {
    // In the item itself: a disabled button has no hover a tooltip could rely on.
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

// Roving tab stop, so one Tab leaves the navigation. Not a tablist: that role
// admits only tabs as children, and group headings sit between the items.
function moveWithArrows(event, nav, onActivate) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (undefined === step && !['Home', 'End'].includes(event.key)) {
    return;
  }
  // A disabled item or the hidden favorites item must not swallow an arrow press.
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
  // Automatic activation: the panels are already in the DOM, so switching costs nothing.
  onActivate(items[next].dataset.tab, false);
}
