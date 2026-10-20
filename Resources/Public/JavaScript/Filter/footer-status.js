/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Hotkeys from '@typo3/backend/hotkeys.js';
import { appendRichText } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

/**
 * The one status element in the modal footer. It holds the live count and
 * whether the selection is applied, as one line: `14 matching pages · not
 * applied to the tree yet`. While counting a placeholder bar stands in for the
 * number and the rest of the line stays, so nothing moves. While nothing is
 * picked it shows the shortcut tip instead.
 *
 * A pending selection with nothing picked (the last chip was removed while the
 * tree is still filtered) keeps the pending notice over the tip: that is the
 * state the notice exists for.
 *
 * The element itself is the live region. Its children are toggled, never
 * rebuilt, so the last settled count survives a failed refresh.
 */

const lang = (key, fallback) => TYPO3.lang?.[key] ?? fallback;

export class FooterStatus {
  element;
  #dot;
  #count;
  #skeleton;
  #suffix;
  #tip;
  #state = { picked: false, dirty: false, countable: false, count: null, loading: false };

  constructor() {
    this.element = document.createElement('p');
    this.element.className = 'pagetree-facets__status';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');

    this.#dot = document.createElement('span');
    this.#dot.className = 'pagetree-facets__status-dot';
    this.#dot.setAttribute('aria-hidden', 'true');
    this.#count = document.createElement('span');
    this.#count.className = 'pagetree-facets__status-count';
    this.#skeleton = document.createElement('span');
    this.#skeleton.className = 'pagetree-facets__status-skeleton';
    this.#skeleton.setAttribute('aria-hidden', 'true');
    this.#suffix = document.createElement('span');
    this.#suffix.className = 'pagetree-facets__status-text';
    this.#tip = document.createElement('span');
    this.#tip.className = 'pagetree-facets__status-text';
    // Core resolves the modifier per platform; the tip names the same key.
    const tip = 'meta' === Hotkeys.normalizedCtrlModifierKey
      ? lang('pagetreeFacets.modal.status.tip.cmd', 'Tip: open this dialog from anywhere with [[Cmd]] [[Shift]] [[L]]')
      : lang('pagetreeFacets.modal.status.tip.ctrl', 'Tip: open this dialog from anywhere with [[Ctrl]] [[Shift]] [[L]]');
    appendRichText(this.#tip, tip);

    this.element.append(this.#dot, this.#count, this.#skeleton, this.#suffix, this.#tip);
    this.#render();
  }

  /**
   * @param {{picked: boolean, dirty: boolean, countable: boolean}} state - `countable`
   *   is whether a count applies at all: the setting is on, the form is the
   *   source of truth and something is picked
   */
  update({ picked, dirty, countable }) {
    this.#state = { ...this.#state, picked, dirty, countable };
    this.#render();
  }

  /** @param {number|null} count - null withdraws the count */
  setCount(count) {
    this.#state = { ...this.#state, count, loading: false };
    this.#render();
  }

  showLoading() {
    this.#state = { ...this.#state, loading: true };
    this.#render();
  }

  hideLoading() {
    this.#state = { ...this.#state, loading: false };
    this.#render();
  }

  #render() {
    const { picked, dirty, countable, count, loading } = this.#state;
    const showTip = !picked && !dirty;
    const showCount = countable && (loading || null !== count);
    const none = showCount && !loading && 0 === count;

    this.#tip.hidden = !showTip;
    this.#count.hidden = !showCount || loading;
    this.#skeleton.hidden = !showCount || !loading;
    if (null !== count) {
      this.#count.textContent = matchCountLabel(count);
    }
    this.#suffix.hidden = !dirty;
    this.#suffix.textContent = showCount
      ? ` · ${lang('pagetreeFacets.modal.status.notApplied.suffix', 'not applied to the tree yet')}`
      : lang('pagetreeFacets.modal.status.notApplied', 'Not applied to the tree yet');
    this.#dot.hidden = !dirty && !none;
    this.#dot.classList.toggle('is-none', none);
    this.#dot.classList.toggle('is-pending', !none && dirty);
  }
}

function matchCountLabel(count) {
  if (0 === count) {
    return lang('pagetreeFacets.modal.matchCount.zero', 'No matching pages');
  }
  if (1 === count) {
    return lang('pagetreeFacets.modal.matchCount.one', '1 matching page');
  }

  return lang('pagetreeFacets.modal.matchCount.other', '%d matching pages').replace('%d', count);
}
