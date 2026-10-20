/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { decorativeIcon, uniqueId } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

/**
 * The collapsible panel explaining how filtering works.
 *
 * Reference material rather than a step in the flow, which is why it is
 * collapsed by default. Every string carries an English fallback so the UI stays
 * usable when the language files have not been loaded.
 */

const HELP_POINTS = {
  combine: 'Criteria from different categories are combined: a page has to match all of them. Picking several options within one category means any of them is enough.',
  chips: 'Everything you picked is listed above. Remove a single criterion with its ×, or start over with "Reset". Your selection only takes effect once you choose "Apply".',
  scope: '"Search from current page down" limits the result to the page you currently have open and its subpages.',
  favorites: 'Save a filter you use often under a name of your choice. Clicking a saved filter loads it back in here — like anything else you pick, it takes effect once you choose "Apply".',
  share: '"Copy link" copies a link to your current selection, so you can hand it to a colleague.',
};

/**
 * @param {{hasPageScope: boolean}} options - the page-scope point is only worth
 *   making while the control it describes is on screen
 * @returns {HTMLElement} collapsed; pair it with renderHelpToggle()
 */
export function renderHelp({ hasPageScope }) {
  const panel = document.createElement('div');
  panel.className = 'alert alert-info pagetree-facets__help';
  panel.id = uniqueId('pagetree-facets__help');
  panel.hidden = true;

  const intro = document.createElement('p');
  intro.textContent = TYPO3.lang?.['pagetreeFacets.modal.help.intro']
    ?? 'Pick one or more criteria to narrow the page tree down to the pages you are looking for.';
  panel.append(intro);

  const keys = ['combine', 'chips', ...(hasPageScope ? ['scope'] : []), 'favorites', 'share'];
  const list = document.createElement('ul');
  list.className = 'pagetree-facets__help-points';
  for (const key of keys) {
    const item = document.createElement('li');
    item.textContent = TYPO3.lang?.[`pagetreeFacets.modal.help.${key}`] ?? HELP_POINTS[key];
    list.append(item);
  }
  panel.append(list);

  // Kept as a closing paragraph rather than a sixth bullet: it is the one point
  // that is not about using this dialog, but about leaving it behind.
  const advanced = document.createElement('p');
  advanced.className = 'mb-0';
  advanced.textContent = TYPO3.lang?.['pagetreeFacets.modal.help.advanced']
    ?? 'Your selection also shows up as text in the page tree’s search field. If you prefer typing, you can edit it there directly, or switch this dialog to its editable filter text with the code button above.';
  panel.append(advanced);

  return panel;
}

/**
 * The icon-only button expanding the help panel. Icon-only, so its accessible name
 * comes from aria-label rather than from content.
 *
 * It also fits the panel with its own × - the two are wired together here
 * because this is the one place that knows both, and a panel that can only be
 * closed by the button that opened it makes the reader hunt for that button
 * again once the text has scrolled it out of reach.
 *
 * @param {HTMLElement} panel - as returned by renderHelp()
 * @returns {HTMLElement}
 */
export function renderHelpToggle(panel) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm btn-default btn-icon pagetree-facets__help-toggle';
  const label = TYPO3.lang?.['pagetreeFacets.modal.help'] ?? 'Filter syntax';
  // Icon-only: aria-label stays the short name, the title explains.
  button.title = TYPO3.lang?.['pagetreeFacets.modal.help.description']
    ?? 'Explains how criteria combine and what each action does.';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', panel.id);

  button.append(decorativeIcon('actions-info-circle'));

  // One place decides, so the panel and the button can never disagree - which
  // is what the [aria-expanded="true"] styling on the button relies on.
  const setExpanded = (expand) => {
    panel.hidden = !expand;
    button.setAttribute('aria-expanded', String(expand));
  };
  button.addEventListener('click', () => setExpanded(panel.hidden));
  panel.append(renderHelpClose(() => {
    setExpanded(false);
    // Focus would otherwise be left on a node that just became hidden.
    button.focus();
  }));

  return button;
}

function renderHelpClose(onClose) {
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pagetree-facets__help-close';
  const label = TYPO3.lang?.['pagetreeFacets.modal.close'] ?? 'Close';
  close.title = TYPO3.lang?.['pagetreeFacets.modal.help.close.description'] ?? 'Closes this panel.';
  close.setAttribute('aria-label', label);
  close.textContent = '×';
  close.addEventListener('click', onClose);

  return close;
}
