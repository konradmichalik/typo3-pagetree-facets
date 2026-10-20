/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { clearControl, renderField } from '@konradmichalik/pagetree-facets/Filter/fields.js';
import { fieldNameCounts } from '@konradmichalik/pagetree-facets/Filter/tab-fields.js';

/**
 * One facet's panel: a heading with the facet name, the sentence saying what it
 * matches and `Select none` once something here is picked, then the fields.
 *
 * A panel with more than 15 options in one criterion is dense: 32px rows in
 * three columns, sticky headings, and the heading counts the selection. Fields
 * that share a name are one criterion split by group (content element types),
 * so their options count together.
 */

const lang = (key, fallback) => TYPO3.lang?.[key] ?? fallback;

const DENSE_ABOVE = 15;

/**
 * @param {object} tab
 * @param {{fieldDeps: object, onChange: () => void}} options - `fieldDeps` is
 *   handed on to renderField(); `onChange` runs after Select none cleared the panel
 * @returns {HTMLElement}
 */
export function buildPanel(tab, { fieldDeps, onChange }) {
  const panel = document.createElement('div');
  panel.className = 'pagetree-facets__panel' + (isDense(tab) ? ' is-dense' : '');
  panel.dataset.panel = tab.identifier;
  panel.append(buildPanelHeading({
    label: tab.label,
    description: tab.configuration.description,
    onSelectNone: () => {
      panel.querySelectorAll('[name]').forEach(clearControl);
      refreshPanel(panel);
      onChange();
    },
  }));

  const fields = document.createElement('div');
  fields.className = 'pagetree-facets__panel-fields';
  const nameCounts = fieldNameCounts(tab);
  for (const field of tab.configuration.fields ?? []) {
    // Built from the same list, so every name is a key; `?? 0` guards the type only.
    /* v8 ignore next */
    const bucketed = (nameCounts.get(field.name) ?? 0) > 1;
    fields.append(renderField(tab, field, { ...fieldDeps, groupToggle: bucketed }));
  }
  // A single field named like the facet would repeat the heading right under it.
  // The legend stays the fieldset's accessible name, it only leaves the screen.
  const legends = fields.querySelectorAll('legend');
  if (1 === legends.length && legends[0].textContent === tab.label) {
    legends[0].classList.add('visually-hidden');
  }
  panel.append(fields);

  return panel;
}

/**
 * @param {{label: string, description?: string, onSelectNone?: () => void}} options -
 *   without `onSelectNone` there is no button, for a panel that holds no criteria
 * @returns {HTMLElement}
 */
export function buildPanelHeading({ label, description, onSelectNone }) {
  const heading = document.createElement('div');
  heading.className = 'pagetree-facets__panel-heading';

  const text = document.createElement('div');
  text.className = 'pagetree-facets__panel-heading-text';
  const title = document.createElement('h2');
  title.className = 'pagetree-facets__panel-title';
  title.textContent = label;
  const sentence = document.createElement('p');
  sentence.className = 'pagetree-facets__panel-description';
  sentence.hidden = !description;
  const count = document.createElement('span');
  count.className = 'pagetree-facets__panel-count';
  count.hidden = true;
  sentence.append(document.createTextNode(description ?? ''), count);
  text.append(title, sentence);
  heading.append(text);

  if (onSelectNone) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-link pagetree-facets__select-none';
    button.textContent = lang('pagetreeFacets.modal.selectNone', 'Select none');
    button.title = lang('pagetreeFacets.modal.selectNone.description', 'Clears every criterion of this category.');
    button.hidden = true;
    button.addEventListener('click', onSelectNone);
    heading.append(button);
  }

  return heading;
}

/**
 * Brings the heading in line with the controls: Select none shows while
 * anything is picked, a dense panel counts its selection.
 *
 * @param {HTMLElement} panel - as built by buildPanel()
 */
export function refreshPanel(panel) {
  const controls = [...panel.querySelectorAll('[name]')];
  panel.querySelector('.pagetree-facets__select-none').hidden = !controls.some(hasValue);

  const count = panel.querySelector('.pagetree-facets__panel-count');
  const dense = panel.classList.contains('is-dense');
  count.hidden = !dense;
  if (dense) {
    const choices = controls.filter((control) => isChoice(control) && '' !== control.value);
    const selected = choices.filter((control) => control.checked).length;
    const sentence = count.closest('.pagetree-facets__panel-description');
    // One space between the description and the count, none without a description.
    count.textContent = ('' === sentence.firstChild.textContent ? '' : ' ') + lang('pagetreeFacets.modal.panel.selected', '%d of %d selected.')
      .replace('%d', String(selected))
      .replace('%d', String(choices.length));
    sentence.hidden = false;
  }
}

function isDense(tab) {
  const perName = new Map();
  for (const field of tab.configuration.fields ?? []) {
    if (['checkbox-group', 'radio-presets', 'select'].includes(field.type)) {
      perName.set(field.name, (perName.get(field.name) ?? 0) + (field.options ?? []).length);
    }
  }

  return [...perName.values()].some((total) => total > DENSE_ABOVE);
}

const isChoice = (control) => 'checkbox' === control.type || 'radio' === control.type;

function hasValue(control) {
  if ('SELECT' === control.tagName) {
    return control.selectedOptions.length > 0;
  }
  if (isChoice(control)) {
    // The neutral radio is the absence of a criterion.
    return control.checked && '' !== control.value;
  }
  const value = undefined !== control.dataset.picker ? (control.dataset.value ?? '') : control.value;

  return '' !== value.trim();
}
