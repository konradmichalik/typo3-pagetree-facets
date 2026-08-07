/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */

import { clearable, decorativeIcon, optionHelp } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

/**
 * The cross-tab filter search: its input, and the flat result list that replaces
 * the tab panels while it has text.
 *
 * Each result is a *proxy* control, not the real one: the criterion it stands for
 * lives in a hidden panel, so the row mirrors that control's checked state and
 * writes back to it on change. Deciding when the list is shown at all stays with
 * the modal - that means hiding panels and clearing the navigation's active state,
 * which is a statement about its tab model rather than about searching.
 */

/**
 * @param {{onQuery: (query: string) => void}} deps
 * @returns {HTMLElement}
 */
export function buildFilterSearchInput({ onQuery }) {
  const wrap = document.createElement('div');
  wrap.className = 'pagetree-facets__filter-search';

  const input = document.createElement('input');
  input.className = 'form-control form-control-sm';
  input.type = 'search';
  // How the modal finds this field again to clear it when a tab is picked.
  input.dataset.role = 'filter-search';
  const label = TYPO3.lang?.['pagetreeFacets.modal.search'] ?? 'Search filters';
  input.placeholder = label;
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => onQuery(input.value));

  wrap.append(clearable(input));

  return wrap;
}

/**
 * @param {Array<{tab: object, field: object, option: object}>} matches
 * @param {{findControl: (tab: object, field: object, option: object) => HTMLInputElement|null}} deps
 * @returns {HTMLElement} the list, or a "nothing found" note - ready to replace
 *   whatever the results panel currently holds
 */
export function renderSearchResults(matches, deps) {
  if (0 === matches.length) {
    const empty = document.createElement('p');
    empty.className = 'pagetree-facets__search-empty text-muted';
    empty.textContent = TYPO3.lang?.['pagetreeFacets.modal.noSearchResults'] ?? 'No matching filters';

    return empty;
  }

  const list = document.createElement('ul');
  list.className = 'pagetree-facets__search-list list-unstyled';
  for (const match of matches) {
    list.append(renderResultItem(match, deps));
  }

  return list;
}

function renderResultItem({ tab, field, option }, { findControl }) {
  const isRadio = 'radio-presets' === field.type;
  const control = findControl(tab, field, option);

  const item = document.createElement('li');
  const label = document.createElement('label');
  label.className = 'pagetree-facets__search-result form-check d-flex align-items-center gap-2'
    + (isRadio ? '' : ' form-switch');

  const proxy = buildProxy(tab, field, option, isRadio, control);
  label.append(proxy);

  if (option.icon) {
    label.append(decorativeIcon(option.icon));
  }

  const text = document.createElement('span');
  text.className = 'pagetree-facets__search-result-label';
  text.textContent = option.label;
  label.append(text);

  label.append(originBadge(tab, field));

  if (option.description) {
    label.title = option.description;
    label.append(optionHelp(proxy, option.description));
  }

  item.append(label);

  return item;
}

/**
 * Where the criterion lives - the whole point of a flat cross-tab list. The tab
 * alone is not always enough: the Activity tab offers the same presets under
 * "Last updated" and under "Created", so without the field heading those matches
 * are two identical rows writing to different controls. The heading is therefore
 * appended wherever a tab spreads its criteria over more than one field - which
 * includes the bucketed ones (records by source, content elements by wizard
 * group), where the panel's section heading is the only context a flat list has
 * left. A single-field tab, or a field named after its own tab, would only say
 * the same thing twice.
 */
function originBadge(tab, field) {
  const badge = document.createElement('span');
  badge.className = 'pagetree-facets__search-result-tab';
  badge.append(document.createTextNode(tab.label));

  // No `?? []` guard: a tab without fields produces no matches, so a row for it
  // never reaches this function.
  if (tab.configuration.fields.length < 2 || field.label === tab.label) {
    return badge;
  }

  // "›" is decoration - a screen reader would announce it as "greater than" - so
  // it is hidden and a comma carries the separation into the accessible name.
  const spoken = document.createElement('span');
  spoken.className = 'visually-hidden';
  spoken.textContent = ',';

  const chevron = document.createElement('span');
  chevron.className = 'pagetree-facets__search-result-origin';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';

  badge.append(spoken, chevron, document.createTextNode(field.label));

  return badge;
}

function buildProxy(tab, field, option, isRadio, control) {
  const proxy = document.createElement('input');
  proxy.className = 'form-check-input';
  proxy.type = isRadio ? 'radio' : 'checkbox';
  if (isRadio) {
    // A synthetic, list-scoped group name - native mutual exclusion between
    // matches for the same field, without colliding with the real field's
    // bracketed name (which the generic collectors key off of).
    proxy.name = `search-radio-${tab.identifier}-${field.name}`;
  } else {
    proxy.setAttribute('role', 'switch');
  }
  proxy.checked = Boolean(control?.checked);
  // A match whose control is not in the DOM cannot be toggled through - better
  // visibly inert than silently doing nothing.
  proxy.disabled = !control;
  proxy.addEventListener('change', () => {
    if (!control) {
      return;
    }
    control.checked = proxy.checked;
    // What makes the modal pick the change up: chips, counts and the apply state
    // all hang off this event.
    control.dispatchEvent(new Event('change', { bubbles: true }));
  });

  return proxy;
}
