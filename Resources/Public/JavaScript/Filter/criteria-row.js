/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { buildSaveFavoriteForm } from '@konradmichalik/pagetree-facets/Filter/favorites.js';
import { clearable, decorativeIcon, uniqueId } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { attachPopover } from '@konradmichalik/pagetree-facets/Filter/popover.js';

/**
 * The toolbar between the modal header and the body: the search field with its
 * Text switch, and the criteria row that lists what is picked.
 *
 * The modal owns the state these controls show (which criteria exist, whether
 * anything is savable, whether text mode is on) and calls back into the handles
 * returned here. Nothing in this module reads the form.
 */

const lang = (key, fallback) => TYPO3.lang?.[key] ?? fallback;

/**
 * The row under the search field: the scope chip first, one chip per picked
 * value, then `Clear all` and the actions menu. With no chip it shows a fixed
 * empty state instead; the actions follow whether anything is savable, which a
 * scope alone already is.
 *
 * @param {{scope: HTMLElement|null, onClearAll: () => void, onSaveFavorite: (label: string) => void,
 *   onCopyLink: () => void, focusFallback: () => void}} options - `focusFallback` takes
 *   the focus when the row has no chip left to hand it to
 * @returns {{element: HTMLElement, update: (state: {chips: HTMLElement[], savable: boolean}) => void,
 *   close: () => void}}
 */
export function buildCriteriaRow({ scope, onClearAll, onSaveFavorite, onCopyLink, focusFallback }) {
  const criteria = document.createElement('div');
  criteria.className = 'pagetree-facets__criteria is-empty';
  if (scope) {
    criteria.append(scope);
  }

  const chips = document.createElement('div');
  chips.className = 'pagetree-facets__chips';

  const empty = document.createElement('p');
  empty.className = 'pagetree-facets__criteria-empty';
  empty.textContent = lang(
    'pagetreeFacets.modal.criteria.empty',
    'Nothing picked yet. Choose a category on the left or type a page title above.',
  );

  const saveForm = buildSaveFavoriteForm({ onSave: onSaveFavorite });
  const actions = document.createElement('div');
  actions.className = 'pagetree-facets__criteria-actions';
  actions.hidden = true;
  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.className = 'btn btn-sm btn-link pagetree-facets__clear-all';
  clearAll.textContent = lang('pagetreeFacets.modal.clearAll', 'Clear all');
  clearAll.addEventListener('click', onClearAll);
  const menu = buildActionsMenu({
    onSaveFavorite: (opener) => saveForm.open(opener),
    onCopyLink,
  });
  actions.append(clearAll, menu.element);

  criteria.append(chips, empty, actions);
  const element = document.createElement('div');
  element.className = 'pagetree-facets__criteria-row';
  element.append(criteria, saveForm.form);

  return {
    element,
    update: ({ chips: nodes, savable }) => {
      // Read before the rebuild destroys the focused × or hides Clear all.
      const focusedChip = [...chips.children].findIndex((chip) => chip.contains(document.activeElement));
      const focusedAction = actions.contains(document.activeElement);
      chips.replaceChildren(...nodes);
      criteria.classList.toggle('is-empty', 0 === nodes.length);
      empty.hidden = nodes.length > 0;
      actions.hidden = !savable;
      if (!savable) {
        menu.close();
        saveForm.close();
      }
      if (focusedChip >= 0) {
        focusChip(nodes, focusedChip, focusFallback);
      } else if (focusedAction && !savable) {
        focusFallback();
      }
    },
    close: () => menu.close(),
  };
}

/** The × of the chip now at `index`, else of the last chip, else the fallback. */
function focusChip(nodes, index, focusFallback) {
  const chip = nodes[Math.min(index, nodes.length - 1)];
  if (chip) {
    chip.querySelector('.pagetree-facets__chip-remove').focus();
  } else {
    focusFallback();
  }
}

/**
 * Menu button pattern (WAI-ARIA APG): the items take focus one at a time, the
 * arrows move between them, Escape and a press outside close the menu.
 */
function buildActionsMenu({ onSaveFavorite, onCopyLink }) {
  const element = document.createElement('div');
  element.className = 'pagetree-facets__more-wrap';

  const panel = document.createElement('div');
  panel.id = uniqueId('pagetree-facets__menu');
  panel.className = 'pagetree-facets__menu';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = uniqueId('pagetree-facets__more');
  button.className = 'btn btn-sm btn-default btn-icon pagetree-facets__more';
  button.setAttribute('aria-label', lang('pagetreeFacets.modal.moreActions', 'More actions'));
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', panel.id);
  panel.setAttribute('aria-labelledby', button.id);
  button.append(decorativeIcon('actions-menu-alternative'));

  const items = [
    menuItem('actions-star', lang('pagetreeFacets.modal.saveFavorite', 'Save as favorite'), () => {
      popover.close();
      onSaveFavorite(button);
    }),
    menuItem('actions-clipboard', lang('pagetreeFacets.modal.copyLink', 'Copy link to this filter'), () => {
      popover.close(true);
      onCopyLink();
    }),
  ];
  panel.append(...items);
  panel.addEventListener('keydown', (event) => {
    const current = items.indexOf(document.activeElement);
    const last = items.length - 1;
    const moves = {
      ArrowDown: current + 1 > last ? 0 : current + 1,
      ArrowUp: current - 1 < 0 ? last : current - 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      items[moves[event.key]].focus();
    }
  });

  const popover = attachPopover({ trigger: button, panel, onOpen: () => items[0].focus() });
  element.append(button, panel);

  return { element, close: () => popover.close() };
}

function menuItem(icon, label, onActivate) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'pagetree-facets__menu-item';
  item.setAttribute('role', 'menuitem');
  // Reached with the arrows, not with Tab.
  item.tabIndex = -1;
  item.append(decorativeIcon(icon), document.createTextNode(label));
  item.addEventListener('click', onActivate);

  return item;
}

/**
 * One field for page titles with the Text switch built into its trailing edge.
 * The token field shares the box and takes the freetext's place in text mode.
 *
 * @param {{freetext: string, onToggle: () => void}} options
 * @returns {{element: HTMLElement, freetext: HTMLInputElement, tokenField: HTMLInputElement,
 *   textSwitch: HTMLButtonElement, setTextMode: (on: boolean) => void, setFreetext: (value: string) => void}}
 */
export function buildSearchField({ freetext: initialFreetext, onToggle }) {
  const element = document.createElement('div');
  element.className = 'pagetree-facets__search-field';

  const icon = decorativeIcon('actions-search');
  icon.className = 'pagetree-facets__search-icon';

  const freetext = document.createElement('input');
  freetext.className = 'form-control';
  freetext.type = 'text';
  freetext.dataset.role = 'freetext';
  const freetextLabel = lang('pagetreeFacets.modal.freetext', 'Page title or UID');
  freetext.placeholder = freetextLabel;
  freetext.setAttribute('aria-label', freetextLabel);
  freetext.value = initialFreetext;
  const freetextWrap = document.createElement('div');
  freetextWrap.className = 'pagetree-facets__freetext';
  freetextWrap.append(clearable(freetext));
  const clear = freetextWrap.querySelector('.pagetree-facets__clear');

  const tokenField = buildTokenField();
  const textSwitch = buildTextSwitch(onToggle);
  element.append(icon, freetextWrap, tokenField, textSwitch);

  return {
    element,
    freetext,
    tokenField,
    textSwitch,
    setTextMode: (on) => {
      element.classList.toggle('is-text', on);
      icon.hidden = on;
      freetextWrap.hidden = on;
      tokenField.hidden = !on;
      textSwitch.setAttribute('aria-pressed', String(on));
    },
    // A programmatic write fires no input event, so the × is told by hand.
    setFreetext: (value) => {
      freetext.value = value;
      clear.hidden = '' === value;
    },
  };
}

function buildTokenField() {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control pagetree-facets__token-field';
  input.dataset.role = 'token-query';
  input.hidden = true;
  input.spellcheck = false;
  input.autocapitalize = 'off';
  input.autocomplete = 'off';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('aria-label', lang('pagetreeFacets.modal.tokenView.ariaLabel', 'Filter tokens'));
  input.placeholder = lang('pagetreeFacets.modal.tokenView.placeholder', '');

  return input;
}

function buildTextSwitch(onToggle) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pagetree-facets__text-switch';
  button.title = lang('pagetreeFacets.modal.tokenView.description', 'Shows the whole filter as editable text.');
  button.setAttribute('aria-pressed', 'false');
  button.append(decorativeIcon('actions-code'), document.createTextNode(lang('pagetreeFacets.modal.textMode', 'Text')));
  button.addEventListener('click', onToggle);

  return button;
}

/**
 * One picked value as `<Facet>: <value>` with a × that removes it.
 *
 * @param {{prefix: string, value: string, label: string}} criterion - `label` is
 *   the joined form, the chip's accessible name
 * @param {() => void} onRemove
 * @returns {HTMLElement}
 */
export function renderChip(criterion, onRemove) {
  const chip = document.createElement('span');
  chip.className = 'pagetree-facets__chip';
  // The value gets the ellipsis, so the whole text stays one hover away.
  chip.title = criterion.label;

  const text = document.createElement('span');
  text.className = 'pagetree-facets__chip-label';
  const prefix = document.createElement('span');
  prefix.className = 'pagetree-facets__chip-prefix';
  prefix.textContent = `${criterion.prefix}:`;
  const value = document.createElement('span');
  value.className = 'pagetree-facets__chip-value';
  value.textContent = criterion.value;
  text.append(prefix, document.createTextNode(' '), value);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'pagetree-facets__chip-remove';
  // A function replacer, so `$&` in a page title is not expanded.
  const removeLabel = lang('pagetreeFacets.modal.removeCriterion', 'Remove %s').replace('%s', () => criterion.label);
  remove.setAttribute('aria-label', removeLabel);
  remove.title = removeLabel;
  remove.textContent = '×';
  remove.addEventListener('click', onRemove);

  chip.append(text, remove);

  return chip;
}
