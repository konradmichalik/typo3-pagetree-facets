/**
 * This file is part of the "pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Hotkeys from '@typo3/backend/hotkeys.js';
import FacetsModal from '@konradmichalik/pagetree-facets/facets-modal.js';

/**
 * Wires the modal to the page tree: toolbar button next to the existing
 * filter input, criteria-count badge, one-click reset and the hotkey. Also
 * applies a filter phrase shared via link (see FacetsModal's "copy link"),
 * read once from the URL on load.
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
  // Keep in sync with the same constant in facets-modal.js (#copyLink()).
  #shareParam = 'pagetreeFacetsFilter';
  #pendingSharedFilter = null;

  constructor() {
    document.addEventListener('DOMContentLoaded', () => this.#initialize());
    if (document.readyState !== 'loading') {
      this.#initialize();
    }
  }

  #initialize() {
    // Official hotkeys API (shows up in the backend help cheatsheet).
    // Cmd/Ctrl+Shift+L: the core only claims Cmd+S, Cmd+Shift+S and Cmd+K, so
    // the constraint is the browser, not TYPO3. Cmd+F is the browser's find,
    // Cmd+Shift+F toggles fullscreen in Chrome, and Cmd+Shift+K opens the web
    // console - none of which a page can preventDefault, since the browser
    // handles them before the event reaches us.
    Hotkeys.register(
      [Hotkeys.normalizedCtrlModifierKey, 'shift', 'l'],
      () => this.#openModal(),
      { scope: 'all', allowOnEditables: true },
    );
    // Read a shared filter link once, up front, and scrub it from the visible
    // URL immediately - the tree may not exist yet, so applying it happens
    // later in #injectButton() once the filter input is actually found.
    this.#pendingSharedFilter = this.#extractSharedFilter();
    // The tree web component renders asynchronously - a single injection
    // attempt at DOMContentLoaded races it and silently loses. Retry with a
    // capped backoff instead of observing the whole document.
    this.#injectWithRetry(20);
  }

  // A fresh deep link to a module (no established shell session in this tab
  // yet) gets server-redirected through /typo3/main?redirect=<module>&
  // redirectParams=<original query string>; the client-side module router
  // reconstructs the final, clean module URL afterwards. We read the URL
  // before that reconstruction happens, so the shared param initially lives
  // nested inside redirectParams instead of being a top-level query param -
  // falling back to that is what makes a freshly-pasted link work, not just
  // a reload of an already-loaded module.
  #extractSharedFilter() {
    const url = new URL(window.location.href);
    const direct = url.searchParams.get(this.#shareParam);
    if (null !== direct) {
      url.searchParams.delete(this.#shareParam);
      window.history.replaceState({}, '', url.toString());
      return direct;
    }
    const redirectParams = url.searchParams.get('redirectParams');
    return null !== redirectParams ? new URLSearchParams(redirectParams).get(this.#shareParam) : null;
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
    if (null !== this.#pendingSharedFilter) {
      filterInput.value = this.#pendingSharedFilter;
      filterInput.dispatchEvent(new Event('input', { bubbles: true }));
      this.#pendingSharedFilter = null;
    }
    // v14 tree toolbar markup: .tree-toolbar__menu > .tree-toolbar__search > input,
    // followed by sibling buttons (options dropdown, collapse-all). A native
    // type="search" input renders its own browser clear ("x") button in its
    // trailing corner, so overlaying our button directly on the input (a
    // previous approach) collided with it. Instead, .tree-toolbar__search and
    // our button both become children of a new "button group" wrapper - one
    // flex item within .tree-toolbar__menu, with its own zero-gap flex layout
    // and joined border-radius (see the CSS) - so the button reads as glued
    // to the input's trailing edge without touching the input itself.
    const menu = filterInput.closest('.tree-toolbar__menu') ?? filterInput.parentElement;
    const existing = menu.querySelector('.pagetree-facets-toggle');
    if (existing) {
      return existing;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-icon btn-default btn-borderless pagetree-facets-toggle';
    button.title = `${TYPO3.lang?.['pagetreeFacets.modal.title'] ?? 'Filter page tree'} (Ctrl/Cmd+Shift+L)`;
    const icon = document.createElement('typo3-backend-icon');
    icon.setAttribute('identifier', 'actions-filter');
    icon.setAttribute('size', 'small');
    button.append(icon);
    button.addEventListener('click', () => this.#openModal());
    const search = filterInput.closest('.tree-toolbar__search');
    if (search) {
      const group = document.createElement('div');
      group.className = 'pagetree-facets-search-group';
      search.replaceWith(group);
      group.append(search, button);
      // The input's border colour comes from a dynamic color-mix()/relative-
      // color formula, not a single reusable custom property - copying the
      // live computed value is the only way to guarantee an exact match
      // (and it still tracks light/dark theme correctly at load time).
      button.style.borderColor = getComputedStyle(filterInput).borderColor;
    } else {
      menu.append(button);
    }
    filterInput.addEventListener('input', () => this.#updateBadge());
    this.#updateBadge();
    return button;
  }

  #findFilterInput() {
    return document.querySelector(this.#treeSelector)
      ?.querySelector('input[name="searchTerm"], .search-input, input[type="search"]') ?? null;
  }

  // The outer document's own URL (not the module iframe's) - the client-side
  // module router keeps this in sync with whatever page/module is open, the
  // same source the "copy link" round trip already reads/writes via
  // #extractSharedFilter().
  #currentPageId() {
    const id = new URL(window.location.href).searchParams.get('id');
    const parsed = id ? parseInt(id, 10) : NaN;

    return Number.isNaN(parsed) ? null : parsed;
  }

  #openModal() {
    const input = this.#findFilterInput();
    FacetsModal.open(input?.value ?? '', this.#currentPageId(), (phrase) => {
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
