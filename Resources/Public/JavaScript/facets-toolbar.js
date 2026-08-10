/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Hotkeys from '@typo3/backend/hotkeys.js';
import AjaxRequest from '@typo3/core/ajax/ajax-request.js';
import { decorativeIcon } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
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
  // The element that actually holds the nodes and dispatches the tree events -
  // a child of #treeSelector, which only wraps toolbar plus tree.
  #treeNodesSelector = 'typo3-backend-navigation-component-pagetree-tree';
  // Keep in sync with the same constant in facets-modal.js (#copyLink()).
  #shareParam = 'pagetreeFacetsFilter';
  #pendingSharedFilter = null;
  // Opt-in session persistence (persistFilter setting), exposed via inline
  // settings by BackendAssetsListener. When on, restore the stored phrase on
  // load and save changes back (debounced).
  #persistEnabled = false;
  #pendingPersistedFilter = '';
  #persistTimer = null;

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
    this.#persistEnabled = '1' === (TYPO3.settings?.PagetreeFacets?.persistFilter ?? '');
    this.#pendingPersistedFilter = this.#persistEnabled ? (TYPO3.settings?.PagetreeFacets?.persistedFilter ?? '') : '';
    // Opt-out setting (emptyResultNotice, on by default): when off, no listeners
    // are registered at all rather than being registered and doing nothing.
    if ('1' === (TYPO3.settings?.PagetreeFacets?.emptyResultNotice ?? '')) {
      this.#watchForEmptyResult();
    }
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
      this.#scrubShareParam();
      return direct;
    }
    const redirectParams = url.searchParams.get('redirectParams');
    const nested = null !== redirectParams ? new URLSearchParams(redirectParams).get(this.#shareParam) : null;
    if (null !== nested) {
      this.#scrubShareParam();
    }
    return nested;
  }

  // Scrubbing once, right here, is not enough to make it stick: TYPO3's own
  // module router (module/router.js#updateBrowserState) reconstructs the
  // final per-module URL straight from redirectParams via its own
  // history.replaceState, once the module iframe reports back - carrying our
  // param right back into the visible query string, since the router has no
  // notion of it. That reconstruction is asynchronous and lands strictly
  // after this first call, so a one-shot scrub loses the race every time
  // (confirmed live: the param was still in location.href 12+ seconds after
  // load, with no further popstate/hashchange in between - the router's
  // replaceState is a same-document navigation that fires none of those).
  // The router's "typo3-iframe-load" handler also calls updateBrowserState
  // and then dispatches "typo3-module-load" (no "-ed") - a separate event we
  // deliberately don't listen for. We hook "typo3-module-loaded" instead,
  // dispatched (bubbling to document) right after the "typo3-iframe-loaded"
  // reconstruction, which is the one that lands last for a completed
  // navigation - listening there lets us clean up right after the fact
  // instead of guessing at a delay. If the iframe never reaches "loaded" (a
  // navigation that starts but never completes), this re-scrub never fires
  // either - a real but unlikely gap, since the tree/URL wouldn't have
  // settled on anything worth scrubbing in that case anyway.
  #scrubShareParam() {
    const strip = () => {
      const url = new URL(window.location.href);
      if (null === url.searchParams.get(this.#shareParam)) {
        return;
      }
      url.searchParams.delete(this.#shareParam);
      // Preserve whatever state the router just set - it drives its own
      // popstate-based back/forward handling, and only the URL is ours to touch.
      window.history.replaceState(window.history.state, '', url.toString());
    };
    strip();
    document.addEventListener('typo3-module-loaded', strip);
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
    } else if ('' !== this.#pendingPersistedFilter) {
      // Restore the session filter, but never clobber a value the user is
      // already looking at (e.g. a deep link without our share param).
      if ('' === filterInput.value) {
        filterInput.value = this.#pendingPersistedFilter;
        filterInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    this.#pendingPersistedFilter = '';
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
    const buttonLabel = `${TYPO3.lang?.['pagetreeFacets.modal.title'] ?? 'Filter page tree'} (Ctrl/Cmd+Shift+L)`;
    button.title = buttonLabel;
    // Icon-only, and the icon is hidden from assistive technology - so the name has
    // to be explicit rather than left to `title`, the weakest source there is.
    button.setAttribute('aria-label', buttonLabel);
    button.append(decorativeIcon('pagetree-facets'));
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
    filterInput.addEventListener('input', () => {
      this.#updateBadge();
      this.#schedulePersist(filterInput.value);
    });
    this.#updateBadge();
    return button;
  }

  // Save the current phrase to the session, debounced so live typing produces
  // one request after the user pauses rather than one per keystroke. No-op
  // unless the persistFilter setting is on.
  #schedulePersist(phrase) {
    if (!this.#persistEnabled) {
      return;
    }
    window.clearTimeout(this.#persistTimer);
    this.#persistTimer = window.setTimeout(() => {
      new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_persist).post({ phrase });
    }, 400);
  }

  // "Filter matched nothing" is a dead end otherwise: the tree just goes blank,
  // and the only ways out are hand-editing the search field or opening the modal
  // to hit Reset. So offer the reset right where the emptiness is visible.
  //
  // Driven by the core's own filter lifecycle events, which both bubble and are
  // composed - hence document is a safe listening point, and no waiting for the
  // asynchronously rendered tree is needed.
  //
  // NOTE: deliberately NOT typo3:tree:nodes-prepared. That one is dispatched
  // only from the tree's loadData()/loadChildren(); the filter path calls
  // enhanceNodes() directly, so it never fires for a filter at all.
  #watchForEmptyResult() {
    // Fires for every non-empty search phrase, ours or the core's own title/UID
    // search - an empty tree is the same dead end either way.
    document.addEventListener('typo3:tree:filter-applied', (event) => {
      this.#toggleEmptyNotice(this.#isEmptyResult(event.detail?.resultCount ?? -1));
    });
    // Dispatched instead of filter-applied once the phrase is empty again.
    document.addEventListener('typo3:tree:filter-reset', () => this.#toggleEmptyNotice(false));
  }

  // resultCount cannot be compared against 0: filterDataAction always returns
  // the entry point node(s) - the virtual root for admins, the web mounts
  // otherwise - so a filter matching nothing still reports one item per entry
  // point, never zero. Instead ask whether anything came back *below* the entry
  // points, which self-calibrates to however many there are.
  //
  // Reading tree.nodes is safe here: the filter assigns the new nodeMap before
  // dispatching filter-applied. It only skips that assignment when the response
  // is completely empty, which resultCount 0 covers separately.
  //
  // Known edge case: if an entry point page matches the filter and nothing else
  // does, this still reports "empty", because an entry point is returned either
  // way and carries no "matched" marker. The tree does look empty then, so the
  // reset is still the useful offer - only the wording is slightly off.
  #isEmptyResult(resultCount) {
    if (0 === resultCount) {
      return true;
    }
    const tree = document.querySelector(this.#treeSelector)?.querySelector(this.#treeNodesSelector);
    const nodes = tree?.nodes ?? [];

    return nodes.length > 0 && !nodes.some((node) => node.depth > 0);
  }

  #toggleEmptyNotice(show) {
    const existing = document.querySelector('.pagetree-facets-empty');
    if (!show) {
      existing?.remove();
      return;
    }
    if (existing) {
      return;
    }
    const tree = document.querySelector(this.#treeSelector)?.querySelector(this.#treeNodesSelector);
    const filterInput = this.#findFilterInput();
    if (!tree || !filterInput) {
      return;
    }

    // Placed as a SIBLING of the tree component, never inside it: the tree
    // renders into its own light DOM (createRenderRoot returns this), so any
    // node we put in there is discarded on its next render.
    const notice = document.createElement('div');
    notice.className = 'pagetree-facets-empty';
    notice.setAttribute('role', 'status');

    const text = document.createElement('p');
    text.className = 'pagetree-facets-empty__text';
    text.textContent = TYPO3.lang?.['pagetreeFacets.empty.text'] ?? 'No pages match the current filter.';
    notice.append(text);

    const actions = document.createElement('div');
    actions.className = 'pagetree-facets-empty__actions';

    const adjust = document.createElement('button');
    adjust.type = 'button';
    adjust.className = 'btn btn-sm btn-default d-inline-flex align-items-center gap-1';
    // The same glyph the toolbar button carries, because it leads to the same
    // place - the filter modal. Decorative: the button's own text is the label.
    adjust.append(
      decorativeIcon('pagetree-facets'),
      document.createTextNode(TYPO3.lang?.['pagetreeFacets.empty.adjust'] ?? 'Adjust filter'),
    );
    adjust.title = TYPO3.lang?.['pagetreeFacets.empty.adjust.description']
      ?? 'Opens the filter dialog on the filter that matched nothing.';
    // Narrowing the criteria is usually the better way out than starting over,
    // so it comes first - the modal opens on the phrase that just failed.
    adjust.addEventListener('click', () => this.#openModal());
    actions.append(adjust);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn btn-sm btn-default d-inline-flex align-items-center gap-1';
    // Matches the modal's own "Reset" action, which uses the same icon.
    reset.append(
      decorativeIcon('actions-refresh'),
      document.createTextNode(TYPO3.lang?.['pagetreeFacets.empty.reset'] ?? 'Reset filter'),
    );
    reset.title = TYPO3.lang?.['pagetreeFacets.empty.reset.description']
      ?? 'Clears the filter and shows the whole page tree again.';
    reset.addEventListener('click', () => {
      filterInput.value = '';
      // The core's toolbar binds a debounced "input" listener to this field and
      // calls tree.filter(value) from it, so this is what makes the tree reload
      // unfiltered - the same path as clearing the field by hand.
      filterInput.dispatchEvent(new Event('input', { bubbles: true }));
      // filter-reset would clear the notice too, but only after the debounce and
      // the request; drop it right away so the click feels immediate.
      this.#toggleEmptyNotice(false);
      this.#updateBadge();
    });
    actions.append(reset);
    notice.append(actions);

    tree.after(notice);
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

  // Disabling the toggle for the duration makes the wait visible; FacetsModal
  // holds the actual guard against a second modal (the hotkey bypasses the
  // button entirely).
  async #openModal() {
    const input = this.#findFilterInput();
    const button = document.querySelector('.pagetree-facets-toggle');
    if (button) {
      button.disabled = true;
    }
    try {
      await FacetsModal.open(input?.value ?? '', this.#currentPageId(), (phrase) => {
        if (input) {
          input.value = phrase;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        this.#updateBadge();
      });
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
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
