/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { appendRichText, decorativeIcon, uniqueId } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

/**
 * The two explanatory surfaces of the modal: a rotating one-line usage tip shown
 * while no filter is active, and a collapsible panel explaining how filtering
 * works.
 *
 * Both are reference material rather than steps in the flow, which is why the panel
 * is collapsed by default and the tip occupies space that would otherwise be empty.
 * Every string carries an English fallback so the UI stays usable when the language
 * files have not been loaded.
 */

const HINTS = {
  'pagetreeFacets.modal.hint.tokens': 'Prefer typing? Enter tokens like `doktype:1 is:empty` straight into the tree\'s search field.',
  'pagetreeFacets.modal.hint.combine': 'Whitespace means AND, a comma means OR within one criterion — try `doktype:1,4`.',
  'pagetreeFacets.modal.hint.favorites': 'Save a filter you use often as a favorite and reopen it in one click.',
  'pagetreeFacets.modal.hint.copyLink': 'Copy a filter as a link and hand it to a colleague — it reopens exactly as you left it.',
  'pagetreeFacets.modal.hint.liveSearch': 'Looking for a single record instead? The global backend search opens with [[Ctrl]]/[[Cmd]]+[[K]].',
  'pagetreeFacets.modal.hint.scope': 'Narrow results to one site or the current subtree with the scope controls above.',
};

const HELP_POINTS = {
  combine: 'Criteria from different categories are combined: a page has to match all of them. Picking several options within one category means any of them is enough.',
  chips: 'Everything you picked is listed above. Remove a single criterion with its ×, or start over with "Reset". Your selection only takes effect once you choose "Apply".',
  scope: '"Search from current page down" limits the result to the page you currently have open and its subpages.',
  share: '"Copy link" copies a link to your current selection, so you can hand it to a colleague.',
};

/**
 * A lightbulb usage tip. One is picked at random per call - the modal calls this
 * once per open, so the tip stays put while the user toggles filters on and off.
 *
 * @returns {HTMLElement}
 */
export function renderHint() {
  const keys = Object.keys(HINTS);
  const key = keys[Math.floor(Math.random() * keys.length)];

  const hint = document.createElement('div');
  hint.className = 'pagetree-facets__hint';

  const text = document.createElement('span');
  appendRichText(text, TYPO3.lang?.[key] ?? HINTS[key]);

  hint.append(decorativeIcon('actions-lightbulb-on'), text);

  return hint;
}

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

  const keys = ['combine', 'chips', ...(hasPageScope ? ['scope'] : []), 'share'];
  const list = document.createElement('ul');
  list.className = 'pagetree-facets__help-points';
  for (const key of keys) {
    const item = document.createElement('li');
    item.textContent = TYPO3.lang?.[`pagetreeFacets.modal.help.${key}`] ?? HELP_POINTS[key];
    list.append(item);
  }
  panel.append(list);

  const advanced = document.createElement('p');
  advanced.className = 'mb-0';
  advanced.textContent = TYPO3.lang?.['pagetreeFacets.modal.help.advanced']
    ?? 'Your selection also shows up as text in the page tree’s search field. If you prefer typing, you can edit it there directly.';
  panel.append(advanced);

  return panel;
}

/**
 * The icon-only button expanding the help panel. Icon-only, so its accessible name
 * comes from aria-label rather than from content.
 *
 * @param {HTMLElement} panel - as returned by renderHelp()
 * @returns {HTMLElement}
 */
export function renderHelpToggle(panel) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm btn-default btn-icon pagetree-facets__help-toggle';
  const label = TYPO3.lang?.['pagetreeFacets.modal.help'] ?? 'Filter syntax';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', panel.id);

  button.append(decorativeIcon('actions-info-circle'));

  button.addEventListener('click', () => {
    const expand = panel.hidden;
    panel.hidden = !expand;
    button.setAttribute('aria-expanded', String(expand));
  });

  return button;
}
