/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */

/**
 * The live match count: one debounced request per settled change, a
 * placeholder bar for a request slow enough to be noticed, and sequence
 * guards so a response landing out of order never reaches the footer.
 *
 * The modal decides when a count applies at all (the setting, text mode,
 * whether anything is picked) through the callbacks; this class only owns the
 * timing and writes into the footer status.
 */

/** A network round trip needs a longer window than a local DOM re-render. */
const DEBOUNCE_MS = 350;
/** A request that resolves within this never shows anything but its result. */
const LOADING_DELAY_MS = 10;

export class LiveCount {
  #status;
  #request;
  #isActive;
  #hasFilter;
  #debounce = null;
  // Separate from #debounce, which gates whether a request is sent at all.
  #loadingTimer = null;
  // Guards against out-of-order responses: a response is only applied while it
  // is still the newest request.
  #seq = 0;

  /**
   * @param {{status: import('./footer-status.js').FooterStatus, request: () => Promise<number|null>,
   *   isActive: () => boolean, hasFilter: () => boolean}} deps - `isActive` is whether a
   *   count applies right now (setting on, form is the source of truth), `hasFilter`
   *   whether anything is picked
   */
  constructor({ status, request, isActive, hasFilter }) {
    this.#status = status;
    this.#request = request;
    this.#isActive = isActive;
    this.#hasFilter = hasFilter;
  }

  /**
   * Arms a debounced refresh after a change.
   *
   * @param {boolean} showLoadingImmediately - false where nothing the count
   *   depends on changed (the initial open, a label resolving late): the
   *   skeleton would flash for no reason before the real refresh replaces it
   */
  schedule(showLoadingImmediately = true) {
    if (!this.#isActive()) {
      return;
    }
    if (!this.#hasFilter()) {
      // Nothing active - the endpoint would resolve this to null anyway (see
      // FilterResolutionService), so skip the round trip. Also supersedes a
      // request still in flight from a criterion that was just cleared.
      this.cancel();
      this.#status.setCount(null);
      return;
    }
    // The previous count is stale the instant a criterion changes; the skeleton
    // says so right away rather than after the debounce.
    if (showLoadingImmediately) {
      this.#showLoading();
    }
    clearTimeout(this.#debounce);
    this.#debounce = window.setTimeout(() => this.#refresh(), DEBOUNCE_MS);
  }

  /** Populates right away, cancelling a debounced refresh armed just before. */
  refreshNow() {
    clearTimeout(this.#debounce);
    this.#refresh();
  }

  /** Drops the pending timers and lets any response in flight fall through. */
  cancel() {
    clearTimeout(this.#debounce);
    clearTimeout(this.#loadingTimer);
    ++this.#seq;
  }

  async #refresh() {
    const seq = ++this.#seq;
    // seq was just incremented, so whatever this clears belongs to an older
    // call. The clears further down come after an await and need the seq check.
    clearTimeout(this.#loadingTimer);
    this.#loadingTimer = window.setTimeout(() => this.#showLoading(), LOADING_DELAY_MS);
    let count;
    try {
      count = await this.#request();
    } catch {
      // Keep the last known count on screen, no error surfaced. Only revert a
      // skeleton this very request put up, never a newer one's.
      if (seq === this.#seq) {
        clearTimeout(this.#loadingTimer);
        this.#status.hideLoading();
      }
      return;
    }
    if (seq !== this.#seq || !this.#isActive()) {
      return; // superseded by a newer request, or the count stopped applying meanwhile
    }
    clearTimeout(this.#loadingTimer);
    this.#status.setCount(count);
  }

  // The delayed timer may fire after the count stopped applying.
  #showLoading() {
    if (!this.#isActive()) {
      return;
    }
    this.#status.showLoading();
  }
}
