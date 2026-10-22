/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */

import { clearable, decorativeIcon, format, lang, optionHelp } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

/**
 * The criterion search: its input, and the result view that replaces the facet
 * panels while it has text. Matches are grouped by facet and field, the matched
 * part of each label is marked, and the heading announces the count.
 *
 * Each result is a *proxy* control, not the real one: the criterion it stands for
 * lives in a hidden panel, so the row mirrors that control's checked state and
 * writes back to it on change. Deciding when the view is shown at all stays with
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
  const label = lang('pagetreeFacets.modal.search', 'Find a criterion');
  input.placeholder = label;
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => onQuery(input.value));

  wrap.append(clearable(input));
  // Escape clears a search the way the × does; an empty field leaves the key to
  // the modal, which closes on it.
  input.addEventListener('keydown', (event) => {
    if ('Escape' === event.key && '' !== input.value) {
      event.preventDefault();
      event.stopPropagation();
      wrap.querySelector('.pagetree-facets__clear').click();
    }
  });

  return wrap;
}

/**
 * The result view. The heading is a live region that stays in the DOM, so each
 * new count is announced; only the groups under it are rebuilt per query.
 *
 * @param {{onShowAll: (identifier: string) => void}} deps - `Show all in <Facet>`
 * @returns {{element: HTMLElement, show: (matches: Array<{tab: object, field: object, option: object}>,
 *   query: string, deps: {findControl: Function}) => void, hide: () => void}}
 */
export function buildSearchResults({ onShowAll }) {
  const element = document.createElement('div');
  element.className = 'pagetree-facets__search-results';
  element.hidden = true;

  const headingRow = document.createElement('div');
  headingRow.className = 'pagetree-facets__search-heading-row';
  const heading = document.createElement('h2');
  heading.className = 'pagetree-facets__search-heading';
  heading.setAttribute('aria-live', 'polite');
  const escHint = document.createElement('span');
  escHint.className = 'pagetree-facets__search-esc';
  escHint.textContent = lang('pagetreeFacets.modal.search.escHint', 'Esc clears the search');
  headingRow.append(heading, escHint);

  const body = document.createElement('div');
  body.className = 'pagetree-facets__search-body';

  const scope = document.createElement('p');
  scope.className = 'pagetree-facets__search-scope';
  scope.textContent = lang(
    'pagetreeFacets.modal.search.scope',
    'Only the criteria are searched here. To find a page by its title, use the field at the top.',
  );
  element.append(headingRow, body, scope);

  return {
    element,
    show: (matches, query, deps) => {
      heading.textContent = headingLabel(matches.length, query);
      body.replaceChildren(...(matches.length ? renderGroups(matches, query, { ...deps, onShowAll }) : [renderEmpty()]));
      element.hidden = false;
    },
    hide: () => { element.hidden = true; },
  };
}

function headingLabel(count, query) {
  const key = { 0: 'zero', 1: 'one' }[count] ?? 'other';
  const fallback = {
    zero: 'No criteria match “%s”',
    one: '1 criterion matches “%s”',
    other: '%d criteria match “%s”',
  }[key];

  return format(`pagetreeFacets.modal.search.matches.${key}`, fallback, ...('other' === key ? [count, query] : [query]));
}

function renderEmpty() {
  const empty = document.createElement('p');
  empty.className = 'pagetree-facets__search-empty';
  empty.textContent = lang('pagetreeFacets.modal.noSearchResults', 'Try a shorter word, or choose a category on the left.');

  return empty;
}

// One group per field the matches come from, in the order they were found. The
// field object is the key: a bucketed field (content elements per wizard group)
// shares its name with its siblings but is its own group.
function renderGroups(matches, query, deps) {
  const groups = new Map();
  for (const match of matches) {
    if (!groups.has(match.field)) {
      groups.set(match.field, { tab: match.tab, field: match.field, matches: [] });
    }
    groups.get(match.field).matches.push(match);
  }

  return [...groups.values()].map((group) => renderGroup(group, query, deps));
}

function renderGroup({ tab, field, matches }, query, deps) {
  const section = document.createElement('section');
  section.className = 'pagetree-facets__search-group';

  const head = document.createElement('div');
  head.className = 'pagetree-facets__search-group-head';
  const title = document.createElement('h3');
  title.className = 'pagetree-facets__search-group-title';
  title.append(...originParts(tab, field));
  const showAll = document.createElement('button');
  showAll.type = 'button';
  showAll.className = 'btn btn-link btn-sm pagetree-facets__search-show-all';
  showAll.textContent = format('pagetreeFacets.modal.search.showAll', 'Show all in %s', tab.label);
  showAll.addEventListener('click', () => deps.onShowAll(tab.identifier));
  head.append(title, showAll);

  const list = document.createElement('ul');
  list.className = 'pagetree-facets__search-list list-unstyled';
  for (const match of matches) {
    list.append(renderResultItem(match, query, deps));
  }
  section.append(head, list);

  return section;
}

function renderResultItem({ tab, field, option }, query, { findControl }) {
  const isRadio = 'radio-presets' === field.type;
  const control = findControl(tab, field, option);

  const item = document.createElement('li');
  const label = document.createElement('label');
  label.className = 'pagetree-facets__search-result form-check d-flex align-items-center gap-2';

  const proxy = buildProxy(tab, field, option, isRadio, control);
  label.append(proxy);

  if (option.icon) {
    label.append(decorativeIcon(option.icon));
  }

  const text = document.createElement('span');
  text.className = 'pagetree-facets__search-result-label';
  text.append(markMatches(option.label, query));
  label.append(text);

  if (option.description) {
    label.title = option.description;
    label.append(optionHelp(proxy, option.description));
  }

  item.append(label);

  return item;
}

/**
 * The label with every occurrence of the query wrapped in a <mark>. Matching
 * is case-insensitive on the text as it is; whatever the regex does not hit
 * stays plain text, so a label the search matched by a different case folding
 * simply renders unmarked.
 *
 * @param {string} label
 * @param {string} query
 * @returns {DocumentFragment}
 */
export function markMatches(label, query) {
  const fragment = document.createDocumentFragment();
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let lastIndex = 0;
  for (const found of label.matchAll(pattern)) {
    fragment.append(label.slice(lastIndex, found.index));
    const mark = document.createElement('mark');
    mark.className = 'pagetree-facets__search-mark';
    mark.textContent = found[0];
    fragment.append(mark);
    lastIndex = found.index + found[0].length;
  }
  fragment.append(label.slice(lastIndex));

  return fragment;
}

/**
 * Where the criteria of a group live: `<Facet> › <Field>`. The facet alone is
 * not always enough: the Activity facet offers the same presets under "Last
 * updated" and under "Created", and a bucketed field (content elements by
 * wizard group) has the panel's section heading as its only context. A
 * single-field facet, or a field named after its own facet, would only say the
 * same thing twice.
 */
function originParts(tab, field) {
  const parts = [document.createTextNode(tab.label)];

  // No `?? []` guard: a tab without fields produces no matches, so a group for it
  // never reaches this function.
  if (tab.configuration.fields.length < 2 || field.label === tab.label) {
    return parts;
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

  return [...parts, spoken, chevron, document.createTextNode(field.label)];
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
