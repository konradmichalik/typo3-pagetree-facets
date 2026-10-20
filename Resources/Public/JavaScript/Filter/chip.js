/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { lang } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

/**
 * One picked value as `<Facet>: <value>` with a × that removes it. The criteria
 * row and the `+N more` popover both render it, which is why it has its own module.
 *
 * @param {{prefix: string, value: string, label: string}} criterion - `label` is
 *   the joined form, the chip's accessible name
 * @param {() => void} onRemove
 * @param {{withPrefix?: boolean}} options - without the prefix only the value
 *   shows, for a list that already names the facet; the × keeps the full name
 * @returns {HTMLElement}
 */
export function renderChip(criterion, onRemove, { withPrefix = true } = {}) {
  const chip = document.createElement('span');
  chip.className = 'pagetree-facets__chip';

  const text = document.createElement('span');
  text.className = 'pagetree-facets__chip-label';
  if (withPrefix) {
    // The value gets the ellipsis, so the whole text stays one hover away.
    chip.title = criterion.label;
    const prefix = document.createElement('span');
    prefix.className = 'pagetree-facets__chip-prefix';
    prefix.textContent = `${criterion.prefix}:`;
    text.append(prefix, document.createTextNode(' '));
  }
  const value = document.createElement('span');
  value.className = 'pagetree-facets__chip-value';
  value.textContent = criterion.value;
  text.append(value);

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
