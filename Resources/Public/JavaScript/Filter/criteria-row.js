/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { clearable, decorativeIcon } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

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
  const removeLabel = lang('pagetreeFacets.modal.removeCriterion', 'Remove %s').replace('%s', criterion.label);
  remove.setAttribute('aria-label', removeLabel);
  remove.title = removeLabel;
  remove.textContent = '×';
  remove.addEventListener('click', onRemove);

  chip.append(text, remove);

  return chip;
}
