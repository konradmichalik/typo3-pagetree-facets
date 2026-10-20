/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Hotkeys from '@typo3/backend/hotkeys.js';
import { appendRichText, lang } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

/**
 * The one status line in the modal footer: the live count and whether the
 * selection is applied, or the shortcut tip while nothing is picked. The count
 * and the pending text sit in a live region, the tip beside it so its return is
 * not announced. Parts are toggled, never rebuilt, so the last settled count
 * survives a failed refresh.
 */

export class FooterStatus {
  element;
  #dot;
  #count;
  #skeleton;
  #suffix;
  #tip;
  #onRender;
  #state = { picked: false, dirty: false, countable: false, count: null, loading: false };

  /**
   * @param {{onRender?: (state: {none: boolean}) => void}} options - told after every
   *   render whether a settled count of 0 is on screen, for the callout that
   *   follows the same state
   */
  constructor({ onRender = () => {} } = {}) {
    this.#onRender = onRender;
    this.element = document.createElement('p');
    this.element.className = 'pagetree-facets__status';
    const live = document.createElement('span');
    live.className = 'pagetree-facets__status-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

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
    this.#tip.className = 'pagetree-facets__status-text pagetree-facets__status-tip';
    // Core resolves the modifier per platform; the tip names the same key.
    const tip = 'meta' === Hotkeys.normalizedCtrlModifierKey
      ? lang('pagetreeFacets.modal.status.tip.cmd', 'Tip: open this dialog from anywhere with [[Cmd]] [[Shift]] [[L]]')
      : lang('pagetreeFacets.modal.status.tip.ctrl', 'Tip: open this dialog from anywhere with [[Ctrl]] [[Shift]] [[L]]');
    appendRichText(this.#tip, tip);

    live.append(this.#dot, this.#count, this.#skeleton, this.#suffix);
    this.element.append(live, this.#tip);
    this.#render();
  }

  /**
   * @param {{picked: boolean, dirty: boolean, countable: boolean}} state - `countable`
   *   is whether a count applies at all (setting on, form view, something picked)
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
    // A pending selection outranks the tip: the last chip removed while the
    // tree is still filtered is the state the notice exists for.
    const showTip = !picked && !dirty;
    const showCount = countable && (loading || null !== count);
    const none = showCount && !loading && 0 === count;

    this.#tip.hidden = !showTip;
    this.#count.hidden = !showCount || loading;
    this.#skeleton.hidden = !showCount || !loading;
    if (null !== count) {
      setText(this.#count, matchCountLabel(count));
    }
    this.#suffix.hidden = !dirty;
    setText(this.#suffix, showCount
      ? ` · ${lang('pagetreeFacets.modal.status.notApplied.suffix', 'not applied to the tree yet')}`
      : lang('pagetreeFacets.modal.status.notApplied', 'Not applied to the tree yet'));
    this.#dot.hidden = !dirty && !none;
    this.#dot.classList.toggle('is-none', none);
    this.#dot.classList.toggle('is-pending', !none && dirty);
    this.#onRender({ none });
  }
}

// Assigning textContent replaces the text node, which a live region announces again.
function setText(node, text) {
  if (node.textContent !== text) {
    node.textContent = text;
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
