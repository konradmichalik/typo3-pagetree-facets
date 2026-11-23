/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { renderChip } from '@konradmichalik/pagetree-facets/Filter/chip.js';
import { buildCriteriaOverflow } from '@konradmichalik/pagetree-facets/Filter/criteria-overflow.js';
import { buildSaveFavoriteForm } from '@konradmichalik/pagetree-facets/Filter/favorites.js';
import { appendRichText, clearable, decorativeIcon, lang, uniqueId } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { attachPopover } from '@konradmichalik/pagetree-facets/Filter/popover.js';
import { buildPhraseField } from '@konradmichalik/pagetree-facets/Filter/token-highlight.js';

/**
 * The toolbar between the modal header and the body: the search field with its
 * Text switch, and the criteria row that lists what is picked. The modal owns
 * the state shown here and drives the returned handles; nothing here reads the form.
 */

/**
 * The row under the search field: the scope chip, one chip per picked value
 * (two rows at most, the rest behind `+N more`), `Clear all` and the actions
 * menu, or a fixed empty state without chips. The actions follow whether
 * anything is savable, which a scope alone already is. In text mode the short
 * reference takes the place of the chips, since the phrase lists every criterion.
 *
 * @param {{scope: HTMLElement|null, helpLink: HTMLElement, onRemove: (criterion: object) => void,
 *   onClearAll: () => void, onSaveFavorite: (label: string) => void, onCopyLink: () => void,
 *   focusFallback: () => void, measure?: Function, observe?: Function}} options - `helpLink`
 *   is the navigation's link the reference forwards to; `focusFallback` takes the focus
 *   when the row has no chip left to hand it to; `measure` and `observe` go to the
 *   overflow (see Filter/criteria-overflow.js)
 * @returns {{element: HTMLElement, update: (state: {criteria: Array<{prefix: string, value: string, label: string}>,
 *   savable: boolean}) => void, setTextMode: (on: boolean) => void, close: () => void}}
 */
export function buildCriteriaRow({ scope, helpLink, onRemove, onClearAll, onSaveFavorite, onCopyLink, focusFallback, measure, observe }) {
  const criteria = document.createElement('div');
  criteria.className = 'pagetree-facets__criteria is-empty';
  if (scope) {
    criteria.append(scope);
  }

  const chips = document.createElement('div');
  chips.className = 'pagetree-facets__chips';
  criteria.append(chips);

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

  // The popover closing under the focus hands it to the last chip on the row.
  const overflow = buildCriteriaOverflow({
    chips, actions, onRemove, onClearAll, measure, observe,
    onFocusLost: () => focusChip([...chips.children], Infinity, focusFallback, overflow),
  });
  const reference = buildReference(helpLink);
  criteria.append(overflow.element, empty, reference, actions);
  const element = document.createElement('div');
  element.className = 'pagetree-facets__criteria-row';
  element.append(criteria, saveForm.form);

  let textMode = false;
  let savable = false;
  // The reference stands in for the whole row, the actions included: the
  // phrase is edited in the field, and the form view keeps the actions.
  const showState = () => {
    const none = 0 === chips.children.length && !textMode;
    criteria.classList.toggle('is-empty', none);
    empty.hidden = !none;
    actions.hidden = textMode || !savable;
    if (actions.hidden) {
      menu.close();
      saveForm.close();
    }
  };

  return {
    element,
    update: ({ criteria: picked, savable: pickedSavable }) => {
      // Read before the rebuild destroys the focused × or hides Clear all.
      const focusedChip = [...chips.children].findIndex((chip) => chip.contains(document.activeElement));
      const focusedAction = actions.contains(document.activeElement);
      const nodes = picked.map((criterion) => renderChip(criterion, () => onRemove(criterion)));
      chips.replaceChildren(...nodes);
      savable = pickedSavable;
      showState();
      overflow.update(picked);
      if (focusedChip >= 0) {
        focusChip(nodes, focusedChip, focusFallback, overflow);
      } else if (focusedAction && !savable) {
        focusFallback();
      }
    },
    setTextMode: (on) => {
      textMode = on;
      criteria.classList.toggle('is-text', on);
      chips.hidden = on;
      overflow.element.hidden = on;
      reference.hidden = !on;
      showState();
    },
    close: () => {
      menu.close();
      overflow.close();
    },
  };
}

/**
 * The short reference shown instead of the chips in text mode: the grammar in
 * four items and a link to the help. The link forwards to the navigation's own
 * help link, so the popover has one trigger to return focus to.
 */
function buildReference(helpLink) {
  const reference = document.createElement('div');
  reference.className = 'pagetree-facets__reference';
  reference.hidden = true;

  const items = [
    ['criterion', '`key:value` one criterion'],
    ['and', '`space` all must match'],
    ['or', '`1,3` any of these'],
    ['freetext', 'Text without key searches title and UID'],
  ];
  for (const [key, fallback] of items) {
    const item = document.createElement('span');
    item.className = 'pagetree-facets__reference-item';
    appendRichText(item, lang(`pagetreeFacets.modal.reference.${key}`, fallback));
    reference.append(item);
  }

  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'btn btn-link pagetree-facets__reference-link';
  link.textContent = lang('pagetreeFacets.modal.reference.help', 'All keys: How filtering works');
  link.setAttribute('aria-haspopup', 'dialog');
  link.setAttribute('aria-controls', helpLink.getAttribute('aria-controls'));
  link.addEventListener('click', () => helpLink.click());
  reference.append(link);

  return reference;
}

/**
 * The × of the chip now at `index`, else of the last chip, else the fallback.
 * A chip that went behind `+N more` hands the focus to that button instead.
 */
function focusChip(nodes, index, focusFallback, overflow) {
  const chip = nodes[Math.min(index, nodes.length - 1)];
  if (!chip) {
    focusFallback();
  } else if (chip.hidden) {
    overflow.focusButton();
  } else {
    chip.querySelector('.pagetree-facets__chip-remove').focus();
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
 *   phrase: {element: HTMLElement, refresh: () => void, caretLeft: (index: number) => number},
 *   textSwitch: HTMLButtonElement, setTextMode: (on: boolean) => void, setFreetext: (value: string) => void,
 *   setPhrase: (value: string) => void}} `phrase` is the editor around the token field
 *   (see Filter/token-highlight.js); `setPhrase` writes the field and its colours
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
  const phrase = buildPhraseField(tokenField);
  phrase.element.hidden = true;
  const textSwitch = buildTextSwitch(onToggle);
  element.append(icon, freetextWrap, phrase.element, textSwitch);

  return {
    element,
    freetext,
    tokenField,
    phrase,
    textSwitch,
    setTextMode: (on) => {
      element.classList.toggle('is-text', on);
      icon.hidden = on;
      freetextWrap.hidden = on;
      phrase.element.hidden = !on;
      textSwitch.setAttribute('aria-pressed', String(on));
    },
    // A programmatic write fires no input event, so the × is told by hand.
    setFreetext: (value) => {
      freetext.value = value;
      clear.hidden = '' === value;
    },
    // The same for the mirror behind the phrase.
    setPhrase: (value) => {
      tokenField.value = value;
      phrase.refresh();
    },
  };
}

function buildTokenField() {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control pagetree-facets__token-field';
  input.dataset.role = 'token-query';
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
