/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import AjaxRequest from '@typo3/core/ajax/ajax-request.js';

/**
 * Personal favorites: saved filter phrases.
 *
 * This module holds the parts that do not depend on the modal's tab model - the
 * list rendering, the inline save form, and the two round trips. Which tab is
 * active, the navigation entry and the "hide the tab once the last favorite is
 * gone" fallback stay with the modal, because they are decisions about its tab
 * model rather than about favorites.
 *
 * Both endpoints answer with the complete new list rather than a delta, so the
 * caller replaces its copy instead of patching it.
 */

/**
 * One row per favorite: a wide button applying it, and a × removing it.
 *
 * @param {Array<{label: string, tokenString: string}>} favorites
 * @param {{onApply: (tokenString: string) => void, onRemove: (index: number) => void}} handlers
 * @returns {HTMLElement[]} ready for replaceChildren()
 */
export function favoriteRows(favorites, { onApply, onRemove }) {
  const removeLabel = TYPO3.lang?.['pagetreeFacets.modal.removeFavorite'] ?? 'Remove favorite';

  return favorites.map((favorite, index) => {
    const row = document.createElement('div');
    row.className = 'pagetree-facets__favorite';

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'pagetree-facets__favorite-apply';
    apply.title = favorite.tokenString;
    const label = document.createElement('span');
    label.className = 'pagetree-facets__favorite-label';
    label.textContent = favorite.label;
    const phrase = document.createElement('code');
    phrase.className = 'pagetree-facets__favorite-phrase';
    phrase.textContent = favorite.tokenString;
    apply.append(label, phrase);
    apply.addEventListener('click', () => onApply(favorite.tokenString));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pagetree-facets__favorite-remove';
    remove.textContent = '×';
    remove.title = removeLabel;
    remove.setAttribute('aria-label', `${favorite.label} – ${removeLabel}`);
    remove.addEventListener('click', () => onRemove(index));

    row.append(apply, remove);

    return row;
  });
}

/**
 * "Save current filter" as a toggle that reveals an inline name form, so the
 * actions row it sits in stays a single tidy line of links.
 *
 * @param {{onSave: (label: string) => void}} handlers
 * @returns {{toggle: HTMLElement, form: HTMLElement}} the caller places both -
 *   the toggle belongs in the actions row, the form below it.
 */
export function buildSaveFavoriteForm({ onSave }) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pagetree-facets__favorite-add btn btn-sm btn-link d-inline-flex align-items-center gap-1';
  const icon = document.createElement('typo3-backend-icon');
  icon.setAttribute('identifier', 'actions-star');
  icon.setAttribute('size', 'small');
  icon.setAttribute('aria-hidden', 'true');
  toggle.append(icon, document.createTextNode(TYPO3.lang?.['pagetreeFacets.modal.saveFavorite'] ?? 'Save current filter'));

  const form = document.createElement('div');
  form.className = 'pagetree-facets__favorite-form';
  form.hidden = true;

  const nameLabel = TYPO3.lang?.['pagetreeFacets.modal.saveFavorite.placeholder'] ?? 'Name this filter';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control form-control-sm';
  input.placeholder = nameLabel;
  input.setAttribute('aria-label', nameLabel);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn-sm btn-primary';
  save.textContent = TYPO3.lang?.['pagetreeFacets.modal.saveFavorite.save'] ?? 'Save';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-sm btn-default';
  cancel.textContent = TYPO3.lang?.['pagetreeFacets.modal.saveFavorite.cancel'] ?? 'Cancel';

  const closeForm = () => {
    form.hidden = true;
    toggle.hidden = false;
    input.value = '';
  };
  const commit = () => {
    onSave(input.value);
    closeForm();
  };

  toggle.addEventListener('click', () => {
    toggle.hidden = true;
    form.hidden = false;
    input.focus();
  });
  cancel.addEventListener('click', closeForm);
  save.addEventListener('click', commit);
  input.addEventListener('keydown', (event) => {
    if ('Enter' === event.key) {
      // Stop the modal-wide "Enter applies and closes" handler from firing too.
      event.preventDefault();
      event.stopPropagation();
      commit();
    } else if ('Escape' === event.key) {
      event.preventDefault();
      closeForm();
    }
  });

  form.append(input, save, cancel);

  return { toggle, form };
}

/**
 * @returns {Promise<Array<{label: string, tokenString: string}>>} the new list
 */
export async function addFavorite(label, tokenString) {
  const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_favorite_add)
    .post({ label: label.trim(), tokenString });

  return (await response.resolve()).favorites;
}

/**
 * @returns {Promise<Array<{label: string, tokenString: string}>>} the new list
 */
export async function removeFavoriteAt(index) {
  const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_favorite_remove)
    .post({ index });

  return (await response.resolve()).favorites;
}
