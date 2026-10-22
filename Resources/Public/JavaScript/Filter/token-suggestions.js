/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { appendRichText, lang, uniqueId } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { CHOICE_FIELD_TYPES, criterionPrefixes } from '@konradmichalik/pagetree-facets/Filter/tab-fields.js';

/**
 * Suggestions under the phrase field in text mode: the keys while a word is
 * typed, the values of a key after its colon, each with its label. Everything
 * comes from the configuration loaded on open, so there is no request and no
 * count (Performance in docs/design/rules.md).
 *
 * ARIA combobox with list autocomplete, as the user picker: the input keeps
 * focus, the arrows move aria-activedescendant, Enter inserts.
 */

const GAP_PX = 4;

/**
 * One entry per field name across the tabs, named like its chips, then the site
 * scope when there is a site to pick.
 *
 * @param {{tabs: Array<object>, sites?: Array<{identifier: string}>}} configuration
 * @returns {Array<{key: string, label: string}>}
 */
export function keyEntries(configuration) {
  const entries = [];
  for (const tab of configuration.tabs) {
    for (const [field, label] of criterionPrefixes(tab)) {
      entries.push({ key: field.name, label });
    }
  }
  if (configuration.sites?.length) {
    entries.push({ key: 'site', label: lang('pagetreeFacets.modal.summary.site', 'Site') });
  }

  return entries;
}

/**
 * The values of one key: the options of every field of that name (a bucketed
 * key has several), `me` for a user picker that knows the current user, the
 * sites for the site scope. Each value once.
 *
 * @param {{tabs: Array<object>, sites?: Array<{identifier: string}>}} configuration
 * @param {string} key - matched case-insensitively, as the parser reads keys
 * @returns {{heading: string, values: Array<{value: string, label: string}>}}
 */
export function valueEntries(configuration, key) {
  const name = key.toLowerCase();
  const byValue = new Map();
  let heading = '';
  const offer = (prefix, options) => {
    heading ||= `${prefix} · ${name}:`;
    for (const option of options) {
      if (!byValue.has(option.value)) {
        byValue.set(option.value, { value: option.value, label: option.label });
      }
    }
  };
  for (const tab of configuration.tabs) {
    for (const [field, prefix] of criterionPrefixes(tab)) {
      if (field.name !== name) {
        continue;
      }
      const siblings = tab.configuration.fields.filter((candidate) => candidate.name === name);
      offer(prefix, siblings.flatMap((sibling) => fieldValues(sibling)));
    }
  }
  if ('site' === name && configuration.sites?.length) {
    offer(lang('pagetreeFacets.modal.summary.site', 'Site'), configuration.sites.map(({ identifier }) => ({ value: identifier, label: identifier })));
  }

  return { heading, values: [...byValue.values()] };
}

function fieldValues(field) {
  if (CHOICE_FIELD_TYPES.includes(field.type)) {
    return field.options;
  }
  if ('user-picker' === field.type && field.currentUser?.uid) {
    return [{ value: 'me', label: `${lang('pagetreeFacets.modal.me', 'Me')} (${field.currentUser.username})` }];
  }

  return [];
}

/**
 * @param {{input: HTMLInputElement, anchor: HTMLElement, caretLeft: (index: number) => number,
 *   getConfiguration: () => object}} options - `anchor` holds the list and is what
 *   it is positioned in; `caretLeft` is the phrase editor's measure (see
 *   Filter/token-highlight.js); the configuration is read on every keystroke,
 *   since a reflect replaces it
 */
export function attachTokenSuggestions({ input, anchor, caretLeft, getConfiguration }) {
  const view = buildList();
  anchor.append(view.element);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', view.listbox.id);

  let entries = [];
  let context = null;
  let highlighted = -1;

  const options = () => [...view.listbox.querySelectorAll('[role="option"]')];

  function close() {
    view.element.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    markHighlighted(-1);
  }

  // Wraps around at both ends.
  function highlight(index) {
    const count = options().length;
    markHighlighted(count ? ((index % count) + count) % count : -1);
  }

  function markHighlighted(index) {
    highlighted = index;
    const items = options();
    items.forEach((item, position) => {
      const active = position === highlighted;
      item.classList.toggle('is-highlighted', active);
      item.setAttribute('aria-selected', String(active));
    });
    if (highlighted > -1) {
      input.setAttribute('aria-activedescendant', items[highlighted].id);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  // What the caret sits in: the word being typed, or the alternative after a
  // key's colon (and its last comma). Only that part is replaced on insert.
  function readContext() {
    const caret = input.selectionStart;
    const before = input.value.slice(0, caret);
    const tokenStart = before.search(/\S*$/);
    const token = before.slice(tokenStart);
    const colon = token.indexOf(':');
    if (colon < 0) {
      return { mode: 'key', prefix: token, tokenStart, replaceStart: tokenStart, caret };
    }
    const rest = token.slice(colon + 1);
    const alternative = rest.lastIndexOf(',') + 1;

    return {
      mode: 'value',
      key: token.slice(0, colon),
      prefix: rest.slice(alternative),
      tokenStart,
      replaceStart: tokenStart + colon + 1 + alternative,
      caret,
    };
  }

  function update() {
    context = readContext();
    const needle = context.prefix.toLowerCase();
    let heading;
    if ('key' === context.mode) {
      heading = lang('pagetreeFacets.modal.suggestions.keys', 'Keys');
      entries = keyEntries(getConfiguration())
        .filter(({ key }) => key.startsWith(needle))
        .map(({ key, label }) => ({ token: key, label, insert: `${key}:` }));
    } else {
      const found = valueEntries(getConfiguration(), context.key);
      heading = found.heading;
      entries = found.values
        .filter(({ value, label }) => `${value} ${label}`.toLowerCase().includes(needle))
        .map(({ value, label }) => ({ token: value, label, insert: quote(value) }));
    }
    view.render(heading, entries, (index) => insert(index));
    if (!entries.length) {
      close();

      return;
    }
    view.element.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    markHighlighted(-1);
    place();
  }

  // Under the field where the token starts, never past the anchor's edge.
  function place() {
    const anchorRect = anchor.getBoundingClientRect();
    const phraseRect = (input.closest('.pagetree-facets__phrase') ?? input).getBoundingClientRect();
    const start = phraseRect.left - anchorRect.left + caretLeft(context.tokenStart);
    const width = view.element.getBoundingClientRect().width;
    view.element.style.top = `${anchorRect.height + GAP_PX}px`;
    view.element.style.left = `${Math.max(0, Math.min(start, anchorRect.width - width))}px`;
  }

  function insert(index) {
    const entry = entries[index];
    const done = 'value' === context.mode;
    // A value ends the token: one space follows it, and the caret sits after
    // that space, ready for the next token.
    const text = done ? `${entry.insert} ` : entry.insert;
    const tail = input.value.slice(context.caret).replace(done ? /^ / : '', '');
    input.value = input.value.slice(0, context.replaceStart) + text + tail;
    const caret = context.replaceStart + text.length;
    input.setSelectionRange(caret, caret);
    // The modal reflects it into the form from this event; it also reopens the
    // list, which a value does not need.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (done) {
      close();
    }
  }

  function onKeydown(event) {
    const open = !view.element.hidden;
    if ('ArrowDown' === event.key) {
      event.preventDefault();
      if (!open) {
        update();
      }
      highlight(open ? highlighted + 1 : 0);
    } else if ('ArrowUp' === event.key && open) {
      event.preventDefault();
      highlight(highlighted - 1);
    } else if ('Enter' === event.key && open && highlighted > -1) {
      // Kept from the modal, whose Enter applies and closes.
      event.preventDefault();
      event.stopPropagation();
      insert(highlighted);
    } else if ('Escape' === event.key && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if ('Tab' === event.key) {
      close();
    }
  }

  input.addEventListener('input', update);
  input.addEventListener('keydown', onKeydown);
  input.addEventListener('blur', close);
}

// The grammar quotes a value with whitespace.
function quote(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

function buildList() {
  const element = document.createElement('div');
  element.className = 'pagetree-facets__suggestions';
  element.hidden = true;

  const heading = document.createElement('div');
  heading.id = uniqueId('pagetree-facets__suggestions-heading');
  heading.className = 'pagetree-facets__suggestions-heading';

  const listbox = document.createElement('ul');
  listbox.id = uniqueId('pagetree-facets__suggestions-list');
  listbox.className = 'pagetree-facets__suggestions-list list-unstyled';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-labelledby', heading.id);

  const hints = document.createElement('div');
  hints.className = 'pagetree-facets__suggestions-hints';
  for (const [key, fallback] of [['choose', '[[↑]][[↓]] choose'], ['insert', '[[↵]] insert'], ['close', '[[Esc]] close']]) {
    const hint = document.createElement('span');
    hint.className = 'pagetree-facets__suggestions-hint';
    appendRichText(hint, lang(`pagetreeFacets.modal.suggestions.${key}`, fallback));
    hints.append(hint);
  }
  element.append(heading, listbox, hints);

  return {
    element,
    listbox,
    render: (title, entries, onPick) => {
      heading.textContent = title;
      listbox.replaceChildren(...entries.map((entry, index) => buildOption(entry, index, listbox.id, () => onPick(index))));
    },
  };
}

function buildOption(entry, index, listId, onPick) {
  const option = document.createElement('li');
  option.id = `${listId}-option-${index}`;
  option.className = 'pagetree-facets__suggestion';
  option.setAttribute('role', 'option');
  option.setAttribute('aria-selected', 'false');
  const token = document.createElement('code');
  token.className = 'pagetree-facets__suggestion-token';
  token.textContent = entry.token;
  const label = document.createElement('span');
  label.className = 'pagetree-facets__suggestion-label';
  label.textContent = entry.label;
  option.append(token, label);
  // Keeps focus in the field for a mouse pick, so blur never closes the list first.
  option.addEventListener('mousedown', (event) => event.preventDefault());
  option.addEventListener('click', onPick);

  return option;
}
