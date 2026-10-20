/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { clearable, decorativeIcon, optionHelp } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { renderUserPicker } from '@konradmichalik/pagetree-facets/Filter/user-picker.js';

/**
 * The generic renderer behind FacetInterface::getModalConfiguration().
 *
 * A tab describes its UI declaratively - a list of field descriptors - and this is
 * what turns each descriptor into controls. **This is the extension point: a new
 * field type is added here**, and nowhere else in the frontend.
 *
 * Every control's `name` is `tab[field]`, which is the contract the modal's generic
 * collectors rely on to find them again without knowing anything about the tab.
 */

const dispatch = {
  'checkbox-group': renderChoiceField,
  'radio-presets': renderChoiceField,
  select: renderSelectField,
  'user-picker': renderUserPicker,
};

/**
 * @param {object} tab - the owning tab; supplies the name prefix and hydrated state
 * @param {object} field - the descriptor: `type`, `name`, `label`, `options`, …
 * @param {{getRoot: () => HTMLElement, onLabelResolved: () => void, groupToggle?: boolean}} deps -
 *   the user picker needs the first two (see its module for why); `groupToggle`
 *   marks a checkbox group that is one group of a criterion split over several
 *   fields, and gives its heading a checkbox for the whole group
 * @returns {HTMLElement} a labelled fieldset, ready to append to a panel
 */
export function renderField(tab, field, deps) {
  const group = document.createElement('fieldset');
  group.className = 'form-group';

  const legend = document.createElement('legend');
  legend.className = 'form-label';
  const grouped = deps.groupToggle && 'checkbox-group' === field.type;
  if (grouped) {
    legend.append(...renderGroupHeading(field));
  } else {
    legend.textContent = field.label;
  }
  group.append(legend);

  const state = tab.state?.[field.name];
  // Anything unrecognised falls back to a plain text field rather than rendering
  // nothing: a third-party tab naming a type this version does not know still gets
  // a usable control instead of an empty fieldset.
  group.append((dispatch[field.type] ?? renderTextField)(tab, field, state, deps));
  if (grouped) {
    syncGroupToggle(group);
    // Ticking options one by one moves the group box between its three states.
    group.addEventListener('change', (event) => {
      if (event.target.hasAttribute('name')) {
        syncGroupToggle(group);
      }
    });
  }

  return group;
}

/**
 * The group's checkbox, name and size. The checkbox carries no `name`, so the
 * collectors never mistake it for a criterion; its change event still bubbles
 * to the modal, which reads the options it set.
 */
function renderGroupHeading(field) {
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'form-check-input pagetree-facets__group-toggle';
  const name = (TYPO3.lang?.['pagetreeFacets.modal.selectAllGroup'] ?? 'Select all %s').replace('%s', field.label);
  toggle.setAttribute('aria-label', name);
  toggle.title = name;
  toggle.addEventListener('change', () => {
    const group = toggle.closest('fieldset');
    group.querySelectorAll('input[name]').forEach((option) => { option.checked = toggle.checked; });
    syncGroupToggle(group);
  });

  // Core draws its boxes (mask, colours, size) only inside .form-check.
  const check = document.createElement('span');
  check.className = 'form-check pagetree-facets__group-check';
  check.append(toggle);

  const label = document.createElement('span');
  label.className = 'pagetree-facets__group-label';
  label.textContent = field.label;
  const count = document.createElement('span');
  count.className = 'pagetree-facets__group-count';
  count.textContent = `(${field.options.length})`;

  return [check, label, count];
}

/**
 * Brings a group's checkbox in line with its options: checked for all,
 * indeterminate for some, clear for none.
 *
 * @param {HTMLElement} group - a fieldset rendered with `groupToggle`
 */
export function syncGroupToggle(group) {
  const toggle = group.querySelector('.pagetree-facets__group-toggle');
  const options = [...group.querySelectorAll('input[name]')];
  const checked = options.filter((option) => option.checked).length;
  toggle.checked = checked > 0 && checked === options.length;
  toggle.indeterminate = checked > 0 && checked < options.length;
}

function controlName(tab, field) {
  return `${tab.identifier}[${field.name}]`;
}

/**
 * Checkbox groups and radio presets differ only in exclusivity, so they share a
 * renderer.
 */
function renderChoiceField(tab, field, state) {
  const isRadio = 'radio-presets' === field.type;
  // Options live in their own grid wrapper, not the fieldset itself - a <legend>
  // that is a direct grid item gets extra browser-reserved space around it (a
  // long-standing cross-browser fieldset/legend quirk), inflating the gap under the
  // heading well beyond any margin we set.
  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'pagetree-facets__options';
  if (isRadio) {
    // The way back from a preset. Its empty value keeps it out of every criterion.
    optionsWrap.append(renderChoiceOption(tab, field, { value: '', label: anyTimeLabel() }, state, isRadio));
  }
  for (const option of field.options ?? []) {
    optionsWrap.append(renderChoiceOption(tab, field, option, state, isRadio));
  }

  return optionsWrap;
}

const anyTimeLabel = () => TYPO3.lang?.['pagetreeFacets.modal.anyTime'] ?? 'Any time';

/** The neutral option is the chosen one exactly while the field has no value. */
function isChosen(option, state) {
  if ('' === option.value) {
    return undefined === state || null === state || '' === state || (Array.isArray(state) && 0 === state.length);
  }

  return Array.isArray(state) ? state.includes(option.value) : state === option.value;
}

// A cleared radio falls back to its group's neutral option, else no radio shows as
// selected. No event is dispatched, the callers refresh the modal.
export function clearChoice(input) {
  if ('radio' === input.type) {
    const neutral = input.closest('fieldset')?.querySelector('input[type="radio"][value=""]');
    if (neutral) {
      neutral.checked = true;

      return;
    }
  }
  input.checked = false;
}

/**
 * Empties any named control, whatever its type. No event is dispatched, the
 * callers refresh the modal.
 *
 * @param {HTMLInputElement|HTMLSelectElement} input
 */
export function clearControl(input) {
  if ('SELECT' === input.tagName) {
    Array.from(input.options).forEach((option) => { option.selected = false; });
  } else if ('checkbox' === input.type || 'radio' === input.type) {
    clearChoice(input);
  } else {
    input.value = '';
    // Picker controls keep the wire value out of band (see Filter/user-picker.js).
    delete input.dataset.value;
    delete input.dataset.label;
  }
}

function renderChoiceOption(tab, field, option, state, isRadio) {
  // Plain checkboxes, not form-switch: a switch promises an immediate effect, and
  // nothing here applies before Apply.
  const label = document.createElement('label');
  label.className = 'form-check d-flex align-items-center gap-2';

  const input = document.createElement('input');
  input.className = 'form-check-input';
  input.type = isRadio ? 'radio' : 'checkbox';
  input.name = controlName(tab, field);
  input.value = option.value;
  input.checked = isChosen(option, state);
  label.append(input);

  if (option.icon) {
    label.append(decorativeIcon(option.icon));
  }

  const optionLabel = document.createElement('span');
  optionLabel.className = 'pagetree-facets__option-label';
  optionLabel.textContent = option.label;
  // No separating space: the flex gap owns the spacing now, and a text node
  // between the items would add an uneven one of its own.
  label.append(optionLabel);

  if (option.description) {
    label.title = option.description;
    label.append(optionHelp(input, option.description));
  }

  return label;
}

function renderSelectField(tab, field, state) {
  const select = document.createElement('select');
  select.className = 'form-select';
  select.multiple = true;
  select.name = controlName(tab, field);
  for (const option of field.options ?? []) {
    select.append(new Option(
      option.label,
      option.value,
      false,
      Array.isArray(state) && state.includes(option.value),
    ));
  }

  return select;
}

function renderTextField(tab, field, state) {
  const input = document.createElement('input');
  input.className = 'form-control';
  input.type = 'text';
  input.name = controlName(tab, field);
  input.value = Array.isArray(state) ? (state[0] ?? '') : (state ?? '');
  if (field.placeholder) {
    // Purely a hint: the fieldset legend stays the accessible name, so this never
    // becomes a placeholder-as-label.
    input.placeholder = field.placeholder;
  }

  return clearable(input);
}
