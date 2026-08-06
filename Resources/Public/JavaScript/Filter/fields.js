/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { clearable, optionHelp } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { renderUserPicker } from '@konradmichalik/pagetree-facets/Filter/user-picker.js';

/**
 * The generic renderer behind FilterTabInterface::getModalConfiguration().
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
  'user-picker': renderPickerField,
};

/**
 * @param {object} tab - the owning tab; supplies the name prefix and hydrated state
 * @param {object} field - the descriptor: `type`, `name`, `label`, `options`, …
 * @param {{getRoot: () => HTMLElement, onLabelResolved: () => void}} deps - only the
 *   user picker needs these; see its module for why
 * @returns {HTMLElement} a labelled fieldset, ready to append to a panel
 */
export function renderField(tab, field, deps) {
  const group = document.createElement('fieldset');
  group.className = 'form-group';

  const legend = document.createElement('legend');
  legend.className = 'form-label';
  legend.textContent = field.label;
  group.append(legend);

  const state = tab.state?.[field.name];
  // Anything unrecognised falls back to a plain text field rather than rendering
  // nothing: a third-party tab naming a type this version does not know still gets
  // a usable control instead of an empty fieldset.
  group.append((dispatch[field.type] ?? renderTextField)(tab, field, state, deps));

  return group;
}

function controlName(tab, field) {
  return `${tab.identifier}[${field.name}]`;
}

function renderPickerField(tab, field, state, deps) {
  return renderUserPicker(tab, field, state, deps);
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
  for (const option of field.options ?? []) {
    optionsWrap.append(renderChoiceOption(tab, field, option, state, isRadio));
  }

  return optionsWrap;
}

function renderChoiceOption(tab, field, option, state, isRadio) {
  const label = document.createElement('label');
  // Checkboxes render as TYPO3's own toggle-switch style (form-switch, the same
  // classes core uses for boolean settings) instead of plain browser checkboxes.
  // Radios stay plain radios - a switch implies an independent on/off, which does
  // not fit a mutually-exclusive group.
  label.className = 'form-check d-flex align-items-center gap-1' + (isRadio ? '' : ' form-switch');

  const input = document.createElement('input');
  input.className = 'form-check-input';
  input.type = isRadio ? 'radio' : 'checkbox';
  if (!isRadio) {
    input.setAttribute('role', 'switch');
  }
  input.name = controlName(tab, field);
  input.value = option.value;
  input.checked = Array.isArray(state) ? state.includes(option.value) : state === option.value;
  label.append(input);

  if (option.icon) {
    const icon = document.createElement('typo3-backend-icon');
    icon.setAttribute('identifier', option.icon);
    icon.setAttribute('size', 'small');
    icon.setAttribute('aria-hidden', 'true');
    label.append(icon);
  }

  const optionLabel = document.createElement('span');
  optionLabel.className = 'pagetree-facets__option-label';
  optionLabel.textContent = option.label;
  label.append(document.createTextNode(' '), optionLabel);

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
