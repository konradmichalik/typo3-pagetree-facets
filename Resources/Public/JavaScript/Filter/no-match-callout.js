/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { decorativeIcon, format, lang } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

/**
 * The warning under the criteria row while the live count is 0: how many
 * criteria have to match at once, and that the chips above are the way out.
 * No buttons of its own, Apply stays possible.
 *
 * Deliberately not a live region: the footer status already announces
 * `No matching pages` the moment the count settles, and a second announcement
 * of the same fact would only talk over it. Core's warning alert carries the
 * colours.
 */
export class NoMatchCallout {
  element;
  #title;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'alert alert-warning pagetree-facets__no-match';
    this.element.hidden = true;

    const icon = document.createElement('div');
    icon.className = 'pagetree-facets__no-match-icon';
    icon.append(decorativeIcon('actions-exclamation-triangle'));

    const body = document.createElement('div');
    this.#title = document.createElement('p');
    this.#title.className = 'pagetree-facets__no-match-title';
    const text = document.createElement('p');
    text.className = 'pagetree-facets__no-match-text';
    text.textContent = lang(
      'pagetreeFacets.modal.noMatch.text',
      'Every criterion has to match at once. Remove one with its × above, or widen it in its category. The count below updates right away.',
    );
    body.append(this.#title, text);
    this.element.append(icon, body);
  }

  /**
   * @param {{none: boolean, criteria: number}} state - `none` is whether a settled
   *   count of 0 is on screen, `criteria` the number of chips; without a chip
   *   there is nothing to remove, so the footer status alone carries the 0
   */
  update({ none, criteria }) {
    this.element.hidden = !none || 0 === criteria;
    this.#title.textContent = 1 === criteria
      ? lang('pagetreeFacets.modal.noMatch.one', 'No page matches this criterion')
      : format('pagetreeFacets.modal.noMatch.other', 'No page matches all %d criteria', criteria);
  }
}
