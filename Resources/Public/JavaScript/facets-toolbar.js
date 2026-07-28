/**
 * This file is part of the "pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Hotkeys from '@typo3/backend/hotkeys.js';
import FacetsModal from '@konradmichalik/pagetree-facets/facets-modal.js';

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
class FacetsToolbar {
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
    // v14 tree toolbar markup: .tree-toolbar__menu > .tree-toolbar__search > input.
    // Render the button *inside* the search box (host class) so CSS can float it
    // over the input's trailing edge - it merges with the field and costs no
    // extra toolbar width. Fall back to the input's parent if markup changes.
    const searchBox = filterInput.closest('.tree-toolbar__search') ?? filterInput.parentElement;
    const existing = searchBox.querySelector('.pagetree-facets-toggle');
    if (existing) {
      return existing;
    }
    searchBox.classList.add('pagetree-facets-host');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-borderless pagetree-facets-toggle';
    button.title = 'Filter page tree (Ctrl/Cmd+Shift+F)';
    const icon = document.createElement('typo3-backend-icon');
    icon.setAttribute('identifier', 'actions-filter');
    icon.setAttribute('size', 'small');
    button.append(icon);
    button.addEventListener('click', () => this.#openModal());
    searchBox.append(button);
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
    FacetsModal.open(input?.value ?? '', (phrase) => {
      if (input) {
        input.value = phrase;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      this.#updateBadge();
    });
  }

  #updateBadge() {
    const input = this.#findFilterInput();
    const button = document.querySelector('.pagetree-facets-toggle');
    if (!input || !button) {
      return;
    }
    const count = this.#countCriteria(input.value);
    button.classList.toggle('is-active', count > 0);
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

  // Count active filter *values*, not token keys: `table:a,b` is two criteria,
  // so the badge matches what the modal shows. Quoted values (text:"a,b") count
  // as one; the site scope is excluded (it mirrors the modal's chip count).
  #countCriteria(phrase) {
    const tokenPattern = /(^|\s)([a-z][a-z0-9_-]*):("[^"]*"|\S+)/gi;
    let count = 0;
    let match;
    while ((match = tokenPattern.exec(phrase)) !== null) {
      if (match[2].toLowerCase() === 'site') {
        continue;
      }
      const raw = match[3];
      count += raw.startsWith('"') ? 1 : raw.split(',').filter(Boolean).length;
    }
    return count;
  }
}

export default new FacetsToolbar();
