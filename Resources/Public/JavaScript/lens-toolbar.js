/**
 * This file is part of the "pagetree_lens" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Hotkeys from '@typo3/backend/hotkeys.js';
import LensModal from '@konradmichalik/pagetree-lens/lens-modal.js';

/**
 * Wires the modal to the page tree: toolbar button next to the existing
 * filter input, criteria-count badge, one-click reset and the hotkey.
 *
 * The token string lives in the tree's existing filter input (power users
 * type tokens directly; the modal is convenience on top, never required).
 *
 * NOTE: locating the tree filter input is the single deliberate piece of DOM
 * coupling in this extension (the core offers no toolbar extension point for
 * the tree as of v14). Kept minimal and isolated in #findFilterInput().
 */
class LensToolbar {
  #treeSelector = 'typo3-backend-navigation-component-pagetree';

  constructor() {
    document.addEventListener('DOMContentLoaded', () => this.#initialize());
    if (document.readyState !== 'loading') {
      this.#initialize();
    }
  }

  #initialize() {
    // Official hotkeys API (shows up in the backend help cheatsheet).
    // Cmd/Ctrl+Shift+F - Cmd+K is taken by the live search, Cmd+F by the
    // browser. Verify against v14 defaults during the manual DDEV smoke test.
    Hotkeys.register(
      [Hotkeys.normalizedCtrlModifierKey, 'shift', 'f'],
      () => this.#openModal(),
      { scope: 'all', allowOnEditables: true },
    );
    // The tree web component renders asynchronously - a single injection
    // attempt at DOMContentLoaded races it and silently loses. Retry with a
    // capped backoff instead of observing the whole document.
    this.#injectWithRetry(20);
  }

  #injectWithRetry(attemptsLeft) {
    if (this.#injectButton() || attemptsLeft <= 0) {
      return;
    }
    window.setTimeout(() => this.#injectWithRetry(attemptsLeft - 1), 250);
  }

  #injectButton() {
    const filterInput = this.#findFilterInput();
    if (!filterInput) {
      return null;
    }
    if (filterInput.parentElement.querySelector('.pagetree-lens-toggle')) {
      return filterInput.parentElement.querySelector('.pagetree-lens-toggle');
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-default pagetree-lens-toggle';
    button.title = 'Filter page tree (Ctrl/Cmd+Shift+F)';
    const icon = document.createElement('typo3-backend-icon');
    icon.setAttribute('identifier', 'actions-filter');
    icon.setAttribute('size', 'small');
    button.append(icon);
    button.addEventListener('click', () => this.#openModal());
    filterInput.parentElement.append(button);
    filterInput.addEventListener('input', () => this.#updateBadge());
    this.#updateBadge();
    return button;
  }

  #findFilterInput() {
    return document.querySelector(this.#treeSelector)
      ?.querySelector('input[name="searchTerm"], .search-input, input[type="search"]') ?? null;
  }

  #openModal() {
    const input = this.#findFilterInput();
    LensModal.open(input?.value ?? '', (phrase) => {
      if (input) {
        input.value = phrase;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      this.#updateBadge();
    });
  }

  #updateBadge() {
    const input = this.#findFilterInput();
    const button = document.querySelector('.pagetree-lens-toggle');
    if (!input || !button) {
      return;
    }
    const count = (input.value.match(/(^|\s)[a-z][a-z0-9_-]*:/gi) ?? []).length;
    button.classList.toggle('btn-primary', count > 0);
    button.classList.toggle('btn-default', count === 0);
    let badge = button.querySelector('.badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'badge';
        button.append(badge);
      }
      badge.textContent = String(count);
    } else {
      badge?.remove();
    }
  }
}

export default new LensToolbar();
