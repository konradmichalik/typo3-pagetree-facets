/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Modal from '@typo3/backend/modal.js';
import Notification from '@typo3/backend/notification.js';
import { SeverityEnum } from '@typo3/backend/enum/severity.js';
import AjaxRequest from '@typo3/core/ajax/ajax-request.js';
import { buildCriteriaRow, buildSearchField, renderChip } from '@konradmichalik/pagetree-facets/Filter/criteria-row.js';
import { addFavorite, favoriteRows, removeFavoriteAt } from '@konradmichalik/pagetree-facets/Filter/favorites.js';
import { clearControl } from '@konradmichalik/pagetree-facets/Filter/fields.js';
import { findFilterMatches } from '@konradmichalik/pagetree-facets/Filter/filter-search.js';
import { FooterStatus } from '@konradmichalik/pagetree-facets/Filter/footer-status.js';
import { LiveCount } from '@konradmichalik/pagetree-facets/Filter/live-count.js';
import { decorativeIcon } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { buildHelp } from '@konradmichalik/pagetree-facets/Filter/guidance.js';
import { buildNavigation, isTabEmpty } from '@konradmichalik/pagetree-facets/Filter/navigation.js';
import { buildPanel, buildPanelHeading, refreshPanel } from '@konradmichalik/pagetree-facets/Filter/panel.js';
import { buildScopeMenu } from '@konradmichalik/pagetree-facets/Filter/scope-menu.js';
import { renderSearchResults } from '@konradmichalik/pagetree-facets/Filter/search-results.js';
import { distinctFields, fieldNameCounts } from '@konradmichalik/pagetree-facets/Filter/tab-fields.js';
import { closeOpenUserDropdowns } from '@konradmichalik/pagetree-facets/Filter/user-picker.js';

/**
 * The filter modal: stateless UI over the canonical token string. On open,
 * the current tree filter phrase is hydrated into every tab (server side);
 * "apply" serializes the modal state back into the phrase.
 *
 * Navigation is vertical from day one (Settings-module pattern) so it scales
 * to 15+ tabs once third parties register theirs. Tabs with active criteria
 * show a badge dot in the nav; grouped tabs render under section headers.
 */
class FacetsModal {
  #modal = null;
  #configuration = null;
  #activeTab = null;
  #onApply = null;
  // The criteria row handle (see Filter/criteria-row.js): the chips, the empty
  // state, Clear all and the actions menu.
  #row = null;
  #applyButton = null;
  #baselineState = null;
  // The footer's status line (see Filter/footer-status.js), injected into the
  // modal's own footer; #build() says why that is safe.
  #status = null;
  // One-shot escape hatch for the close guard: the apply paths close the modal
  // themselves while the state still counts as dirty (see #apply).
  #skipCloseGuard = false;
  // Token view: the raw phrase becomes editable in the top bar and stays in
  // two-way sync with the (still editable) form. #currentPhrase is the phrase
  // already applied to the tree - the Apply baseline this mode diffs against,
  // since the form-state baseline no longer describes what is authoritative.
  #tokenMode = false;
  // The search field handle (see Filter/criteria-row.js): the page-title input,
  // the token field and the Text switch that swaps the two.
  #searchField = null;
  // The scope chip (see Filter/scope-menu.js), null when there is nothing to
  // choose: no page open and a single site.
  #scope = null;
  // The help popover and its link (see Filter/guidance.js).
  #help = null;
  #panels = null;
  #currentPhrase = '';
  #reflectSeq = 0;
  #reflectTimer = null;
  #syncTimer = null;
  #resultsPanel = null;
  #root = null;
  // The page open in the backend right now, null in a module without one.
  #currentPage = null;
  #favoritesList = null;
  // Client-side pseudo-tab: favorites are not a filter criterion (no token
  // keys), so they never come from the server tab list - the modal owns this
  // identifier and renders the nav item and panel for it itself.
  #favoritesTabId = '__favorites';
  #favoritesNavItem = null;
  #refreshDebounce = null;
  // Live match-count preview (opt-out via the livePreviewCount ext_conf
  // setting - see BackendAssetsListener). Guarded the same way #tokenMode
  // guards #scheduleTokenFieldSync(): the form stays the source of truth in
  // token view too, but re-querying on every keystroke there would count
  // against a form the token field has not finished reflecting into yet.
  #countEnabled = false;
  // The timing of that preview (see Filter/live-count.js), writing into #status.
  #liveCount = null;
  // Guards the async gap between the open request and the modal appearing: on a
  // slow instance a second click arrives while the configuration is still in
  // flight, and would build a second modal.
  #opened = false;

  /**
   * @param {string} currentPhrase - the phrase the tree is filtered by
   * @param {number|null} currentPageId - the page open right now, if any
   * @param {(phrase: string) => void} onApply
   * @param {string} currentPageTitle - its title as the tree shows it; the scope
   *   list names the page by it
   */
  async open(currentPhrase, currentPageId, onApply, currentPageTitle = '') {
    if (this.#opened) {
      return;
    }
    this.#opened = true;

    try {
      await this.#build(currentPhrase, currentPageId, onApply, currentPageTitle);
    } catch (error) {
      this.#opened = false;
      throw error;
    }
  }

  async #build(currentPhrase, currentPageId, onApply, currentPageTitle) {
    this.#onApply = onApply;
    this.#currentPage = currentPageId ? { uid: currentPageId, title: currentPageTitle } : null;
    this.#currentPhrase = currentPhrase ?? '';
    // This class is exported as a singleton, so every field outlives the modal
    // it belonged to. The baseline is re-established on 'shown' below; until
    // then a null baseline keeps #isDirty() false, so closing the modal again
    // right away cannot be misread as a pending selection.
    this.#baselineState = null;
    this.#skipCloseGuard = false;
    // Fresh per modal: the previous one's status sits in a detached footer.
    this.#status = new FooterStatus();
    this.#countEnabled = '1' === (TYPO3.settings?.PagetreeFacets?.livePreviewCount ?? '');
    this.#liveCount = new LiveCount({
      status: this.#status,
      request: () => this.#requestCount(),
      isActive: () => this.#countApplies,
      hasFilter: () => this.#hasSavableFilter(),
    });
    // Token view belongs to the modal instance, not to the singleton: the field
    // and the toggle are rebuilt hidden/unpressed by #render() below, so leaving
    // the flag on would describe a view that is not on screen - #computePhrase()
    // would hand Apply the fresh (empty) field's value and clear the tree filter.
    this.#tokenMode = false;
    this.#configuration = await this.#requestConfiguration(this.#currentPhrase);
    if (!this.#configuration.tabs.length) {
      this.#opened = false;
      return;
    }
    this.#activeTab = (this.#configuration.tabs.find((tab) => !isTabEmpty(tab)) ?? this.#configuration.tabs[0]).identifier;

    this.#modal = Modal.advanced({
      title: TYPO3.lang?.['pagetreeFacets.modal.title'] ?? 'Filter page tree',
      size: Modal.sizes.large,
      content: this.#render(),
      // Core puts these on the <dialog>, which gives us a scope for the few rules
      // that have to reach its own markup (the title element holding the brand
      // icon). Without it those selectors would restyle every backend modal, since
      // this stylesheet is loaded backend-wide.
      additionalCssClasses: ['pagetree-facets-modal'],
      buttons: [
        {
          text: TYPO3.lang?.['pagetreeFacets.modal.cancel'] ?? 'Cancel',
          btnClass: 'btn-default',
          trigger: () => { this.#modal?.hideModal(); },
        },
        {
          text: TYPO3.lang?.['pagetreeFacets.modal.apply'] ?? 'Apply',
          btnClass: 'btn-primary',
          icon: 'actions-check',
          // Rendered as the button's name attribute, which is how we find it
          // again to enable/disable it (see #refreshApplyState).
          name: 'pagetree-facets-apply',
          trigger: () => { this.#serializeAndApply(); },
        },
      ],
    });
    this.#modal.addEventListener('typo3-modal-shown', () => {
      const root = this.#modal.querySelector('.pagetree-facets');
      root?.addEventListener('keydown', (event) => {
        // Buttons are excluded: Enter is their own activation key, and
        // preventDefault() here would swallow it - a keyboard user could never
        // reach the help link or "copy link".
        if (event.key === 'Enter' && !['TEXTAREA', 'BUTTON'].includes(event.target.tagName)) {
          event.preventDefault();
          this.#serializeAndApply();
        }
      });
      // Brand mark in front of the modal title. Core's title is a plain string
      // property, so there is no markup route through it - but the title element
      // holds that string as a Lit part bounded by marker comments, and prepending
      // lands outside that range, so a title update cannot displace the node.
      // Injected into the title element rather than the header on purpose: the
      // header is justify-content:space-between, so a third child there would push
      // the title into the middle instead of leaving it beside the icon.
      // Purely decorative - the title carries the meaning - hence aria-hidden.
      const brandIcon = decorativeIcon('pagetree-facets');
      brandIcon.className = 'pagetree-facets__brand';
      this.#modal.querySelector('.t3js-modal-title')?.prepend(brandIcon);

      // Core's Lit footer renders the buttons as one bounded array part, so a
      // prepended node survives button re-renders. Missing markup leaves it absent.
      this.#modal.querySelector('.t3js-modal-footer')?.prepend(this.#status.element);

      // Populate the active-filter chips from the hydrated state once the modal
      // is in the DOM (the chip list is derived from the live form controls).
      // Nothing has changed yet - this only mirrors the baseline - so the
      // count's own immediate refresh below must not flash a skeleton first.
      this.#refreshActiveIndicators(false);

      // Baseline for the Apply button: the state as hydrated from the phrase
      // already applied to the tree. Applying an unchanged filter is a no-op, so
      // the button stays disabled until something actually differs - which also
      // makes it obvious that picking a criterion is not applying it.
      this.#applyButton = this.#modal.querySelector('button[name="pagetree-facets-apply"]');
      this.#baselineState = JSON.stringify(this.#collectFormState());
      this.#refreshApplyState();
      if (this.#countApplies && this.#hasSavableFilter()) {
        // No debounce for the very first value. A criterion-less baseline needs
        // nothing, #refreshActiveIndicators() above handled it.
        this.#liveCount.refreshNow();
      }
    });
    // Core fires this cancelable (doHideModal() bails on defaultPrevented) and
    // routes every close through it - Close button, ESC, the X and a backdrop
    // click all end up in doHideModal() - so one listener covers them all.
    this.#modal.addEventListener('typo3-modal-hide', (event) => {
      if (this.#skipCloseGuard || !this.#isDirty()) {
        return;
      }
      event.preventDefault();
      this.#confirmPendingSelection();
    });
    // Only fired after an actual close, so an intercepted one keeps the modal's
    // state (timers, open dropdowns) intact - which is what the guard needs.
    this.#modal.addEventListener('typo3-modal-hidden', () => this.#teardown());
  }

  // Everything that outlives the modal's own DOM: pending debounced refreshes,
  // the token view's reflect/sync timers and the document-level scroll
  // listeners of open user dropdowns.
  #teardown() {
    this.#opened = false;
    clearTimeout(this.#refreshDebounce);
    // A count still in flight must not land in the next modal's status.
    this.#liveCount?.cancel();
    this.#cancelTokenTimers();
    closeOpenUserDropdowns();
    this.#scope?.close();
    this.#row?.close();
    this.#help?.close();
  }

  #render() {
    const wrap = document.createElement('div');
    wrap.className = 'pagetree-facets';
    // Built before the navigation, which holds its link; the popover itself
    // goes into the content so it can sit over the panels.
    this.#help = buildHelp({
      getLayout: () => ({ root: this.#root, nav: this.#root.querySelector('.pagetree-facets__nav') }),
    });
    wrap.append(this.#renderHeader(), this.#renderBody(), this.#help.panel);
    // One listener for the whole content: a body-level one would never see the
    // header controls (freetext, site scope, page scope), which change the
    // filter just as much. Text inputs fire per keystroke and get the full
    // (debounced) refresh; discrete controls refresh the apply state
    // immediately and are covered chip-wise by the body's change listener.
    wrap.addEventListener('change', () => {
      this.#refreshApplyState();
      this.#liveCount.schedule();
    });
    wrap.addEventListener('input', (event) => {
      if (event.target.matches('input[type="text"]')) {
        this.#scheduleRefresh();
      } else {
        this.#refreshApplyState();
      }
    });
    // Handed to the user picker as its reparent target, so its dropdown escapes
    // the scrolling panel's overflow (the module explains why it needs one).
    // Modal.advanced() renders `content` into its own Lit-managed custom element -
    // appending directly to that element is invisible (nodes it did not create are
    // outside its render tree), but this wrapper is plain DOM we fully own, so
    // appending here is safe.
    this.#root = wrap;
    return wrap;
  }

  // The continuous top region: freetext search, optional site scope and the
  // removable chips that mirror the currently active tab criteria.
  #renderHeader() {
    const header = document.createElement('div');
    header.className = 'pagetree-facets__header';

    const search = document.createElement('div');
    search.className = 'pagetree-facets__search';
    this.#searchField = buildSearchField({
      freetext: this.#configuration.freetext ?? '',
      onToggle: () => this.#toggleTokenMode(),
    });
    // Editing the phrase is debounced into #reflectTokenQuery so the form
    // re-hydrates without a round trip per keystroke.
    this.#tokenField.addEventListener('input', () => {
      this.#cancelTokenTimers();
      this.#reflectTimer = window.setTimeout(() => this.#reflectTokenQuery(), 250);
    });
    search.append(this.#searchField.element);
    header.append(search);

    // The scope is picked, not a criterion, so a change here refreshes the
    // indicators directly instead of going through a control's change event.
    this.#scope = buildScopeMenu({
      sites: this.#configuration.sites,
      activeSite: this.#configuration.activeSite,
      pageScope: this.#configuration.pageScope,
      currentPage: this.#currentPage,
      onChange: () => this.#refreshActiveIndicators(),
    });
    // The criteria row mirrors the currently *selected* criteria - selected,
    // not necessarily applied, which is what the footer status spells out.
    this.#row = buildCriteriaRow({
      scope: this.#scope?.element ?? null,
      onClearAll: () => this.#resetAll(),
      onSaveFavorite: (label) => this.#saveFavorite(label),
      onCopyLink: () => this.#copyLink(),
      focusFallback: () => this.#focusBeforeChips(),
    });
    header.append(this.#row.element);

    return header;
  }

  // The scope chip while it is on screen, else whichever search field is.
  #focusBeforeChips() {
    if (this.#scope && !this.#scope.element.hidden) {
      this.#scope.focus();
      return;
    }
    (this.#tokenMode ? this.#tokenField : this.#searchField.freetext).focus();
  }

  #renderBody() {
    const body = document.createElement('div');
    body.className = 'pagetree-facets__body row';
    body.append(this.#renderNavigation(), this.#renderPanels());
    // Keep chips and per-tab counts in sync with the live controls. In token
    // view the form is the other editable half, so a form edit also mirrors
    // back into the phrase field (#scheduleTokenFieldSync is a no-op otherwise).
    // Text inputs get their (debounced) indicator refresh from the wrapper's
    // input listener - the same event bubbles there - so per keystroke this
    // one only owns the token-field sync.
    body.addEventListener('change', () => {
      this.#refreshActiveIndicators();
      this.#scheduleTokenFieldSync();
    });
    body.addEventListener('input', (event) => {
      if (event.target.matches('input[type="text"]')) {
        this.#scheduleTokenFieldSync();
      }
    });
    return body;
  }

  #renderNavigation() {
    return buildNavigation({
      tabs: this.#configuration.tabs,
      activeTab: this.#activeTab,
      // Favorites lead the navigation, above every filter group - quick access
      // to saved filters is the first thing an editor reaches for.
      leading: this.#renderFavoritesNavItem(),
      trailing: this.#help.link,
      onQuery: (query) => this.#applyFilterSearch(query),
      onActivate: (identifier, activated) => this.#switchTab(identifier, activated),
    });
  }

  #renderPanels() {
    this.#panels = document.createElement('div');
    this.#panels.className = 'col-9 pagetree-facets__panels';
    this.#populatePanels();
    return this.#panels;
  }

  // (Re)fill the panels container from the current configuration. Run on first
  // render and on every token-view reflect, where a freshly hydrated config has
  // replaced the tab states and the panels must be rebuilt to match.
  #populatePanels() {
    this.#panels.replaceChildren(this.#renderFavoritesPanel());
    for (const tab of this.#configuration.tabs) {
      this.#panels.append(this.#renderPanel(tab));
    }
    this.#resultsPanel = document.createElement('div');
    this.#resultsPanel.className = 'pagetree-facets__search-results';
    this.#resultsPanel.hidden = true;
    this.#panels.append(this.#resultsPanel);
  }

  #applyFilterSearch(query) {
    const trimmed = query.trim().toLowerCase();
    if ('' === trimmed) {
      this.#resultsPanel.hidden = true;
      this.#modal.querySelectorAll('.pagetree-facets__panel').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== this.#activeTab;
      });
      this.#modal.querySelectorAll('.pagetree-facets__nav-item').forEach((item) => {
        const isActive = item.dataset.tab === this.#activeTab;
        item.classList.toggle('active', isActive);
        if (isActive) {
          item.setAttribute('aria-current', 'true');
        }
      });
      return;
    }
    this.#modal.querySelectorAll('.pagetree-facets__panel').forEach((panel) => { panel.hidden = true; });
    // Search mode has no current tab, so aria-current has to go with the styling -
    // otherwise it would keep announcing a tab that is no longer shown. The roving
    // tab stop deliberately stays put: it remains the way back into the nav.
    this.#modal.querySelectorAll('.pagetree-facets__nav-item').forEach((item) => {
      item.classList.remove('active');
      item.removeAttribute('aria-current');
    });
    this.#resultsPanel.replaceChildren(renderSearchResults(
      findFilterMatches(this.#configuration.tabs, trimmed),
      {
        // The criterion a result stands for lives in a now-hidden panel; the proxy
        // row mirrors that control and writes back to it.
        findControl: (tab, field, option) => this.#modal.querySelector(
          `[name="${tab.identifier}[${field.name}]"][value="${CSS.escape(option.value)}"]`,
        ),
      },
    ));
    this.#resultsPanel.hidden = false;
  }

  // The phrase editor, authoritative in token view. Read through the handle so
  // the rebuilt field of a reopened modal is always the one in use.
  get #tokenField() {
    return this.#searchField.tokenField;
  }

  #renderPanel(tab) {
    const panel = buildPanel(tab, {
      fieldDeps: {
        // #root is read lazily: it is only assigned once #render() finished, which
        // is after every field has been built.
        getRoot: () => this.#root,
        // A label resolving late (e.g. a be_user picker's uid -> name lookup)
        // re-renders a chip's text, not a value - the count is unaffected, so
        // its own immediate refresh must not flash a skeleton over it.
        onLabelResolved: () => this.#refreshActiveIndicators(false),
      },
      // Select none changes controls without firing events, like a chip removal,
      // so the phrase is told here too.
      onChange: () => {
        this.#refreshActiveIndicators();
        this.#scheduleTokenFieldSync();
      },
    });
    panel.hidden = tab.identifier !== this.#activeTab;

    return panel;
  }

  // Personal favorites: saved filter phrases, surfaced as a first-class tab at
  // the top of the navigation. The panel lists them (load on click, × to
  // remove); creating one lives in the header next to "Copy link". All three
  // round-trip through the AJAX endpoints, updating the in-memory list in place.
  #renderFavoritesNavItem() {
    const item = document.createElement('li');
    // No favorites yet -> the whole tab is hidden. It reveals itself the moment
    // the first one is saved and hides again when the last is removed
    // (see #updateFavoritesVisibility). The header's "Save current filter" is the
    // entry point in the meantime, so nothing becomes unreachable.
    item.hidden = 0 === (this.#configuration.favorites ?? []).length;
    this.#favoritesNavItem = item;

    const button = document.createElement('button');
    button.type = 'button';
    // Never the active tab at this point: #build() always picks a real tab's
    // identifier as the initial #activeTab, and #switchTab() (not a re-render)
    // is what moves the active/aria-current/tabIndex state afterwards - see
    // its own generic .pagetree-facets__nav-item pass, which covers this item
    // too.
    button.className = 'pagetree-facets__nav-item';
    button.dataset.tab = this.#favoritesTabId;
    button.tabIndex = -1;
    const text = document.createElement('span');
    text.textContent = TYPO3.lang?.['pagetreeFacets.modal.favorites'] ?? 'Favorites';
    button.append(text);
    button.addEventListener('click', () => this.#switchTab(this.#favoritesTabId, true));
    item.append(button);
    return item;
  }

  #renderFavoritesPanel() {
    const panel = document.createElement('div');
    panel.className = 'pagetree-facets__panel pagetree-facets__panel--favorites';
    panel.dataset.panel = this.#favoritesTabId;
    panel.hidden = this.#favoritesTabId !== this.#activeTab;
    this.#favoritesList = document.createElement('div');
    this.#favoritesList.className = 'pagetree-facets__favorites-list';
    // The same heading every facet panel gets, so this one starts on the same
    // line and in the same rhythm. No Select none: favorites are not criteria.
    panel.append(
      buildPanelHeading({ label: TYPO3.lang?.['pagetreeFacets.modal.favorites'] ?? 'Favorites' }),
      this.#favoritesList,
    );
    this.#renderFavoriteChips();
    return panel;
  }

  #renderFavoriteChips() {
    this.#favoritesList.replaceChildren(...favoriteRows(this.#configuration.favorites ?? [], {
      onLoad: (tokenString) => this.#loadFavorite(tokenString),
      onRemove: (index) => this.#removeFavorite(index),
    }));
  }

  // Loading, not applying. A favorite is a selection like any other, and this
  // modal's whole contract is that selecting is not applying - the pending
  // notice, the Apply button's dirty state and the close guard all exist for
  // that. Applying straight from the list was the one path that drove past the
  // guard, discarding an unapplied selection without asking.
  //
  // Trade-off: the phrase goes through the form, so Apply re-serializes it and
  // drops what the form cannot represent (unknown keys, tokens of disabled
  // tabs). The stored favorite itself is untouched - only what was loaded from
  // it is canonical.
  async #loadFavorite(tokenString) {
    if (this.#tokenMode) {
      // The typed field is authoritative in token view, so it has to carry the
      // favorite too - otherwise Apply would hand over the phrase it replaced.
      this.#cancelTokenTimers();
      this.#tokenField.value = tokenString;
    }
    this.#adoptConfiguration(await this.#requestConfiguration(tokenString));
  }

  // Show the favorites tab only while there is at least one favorite. When the
  // last one is removed while the tab is open, fall back to the first usable
  // filter tab so the panel does not linger empty.
  #updateFavoritesVisibility() {
    const hasFavorites = (this.#configuration.favorites ?? []).length > 0;
    // #renderFavoritesNavItem() always runs once per modal, before this method
    // is ever reachable (it is only called from #removeFavorite/#saveFavorite,
    // both requiring an already-open modal) - so this is never actually null.
    /* v8 ignore next 3 */
    if (this.#favoritesNavItem) {
      this.#favoritesNavItem.hidden = !hasFavorites;
    }
    if (!hasFavorites && this.#favoritesTabId === this.#activeTab) {
      const fallback = this.#configuration.tabs.find((tab) => !isTabEmpty(tab)) ?? this.#configuration.tabs[0];
      // Only undefined if this.#configuration.tabs is itself empty - which
      // #build() already refuses to open a modal for. Reachable only via a
      // token-view reflect/loadFavorite response that legitimately empties
      // tabs while favorites is the open tab, an edge case not worth staging
      // for its own sake.
      /* v8 ignore next 3 */
      if (fallback) {
        this.#switchTab(fallback.identifier);
      }
    }
  }

  async #saveFavorite(label) {
    const tokenString = await this.#computePhrase();
    if ('' === tokenString.trim()) {
      return; // nothing configured to save - the action is hidden in this case anyway
    }
    this.#adoptFavorites(await addFavorite(label, tokenString));
    Notification.success(
      TYPO3.lang?.['pagetreeFacets.modal.favoriteSaved.title'] ?? 'Favorite saved',
      TYPO3.lang?.['pagetreeFacets.modal.favoriteSaved.message'] ?? 'The current filter was saved to your favorites.',
    );
  }

  async #removeFavorite(index) {
    this.#adoptFavorites(await removeFavoriteAt(index));
  }

  // Both endpoints answer with the complete new list, so the in-memory copy is
  // replaced rather than patched - and the list plus the tab's own visibility have
  // to follow in lockstep, which is why neither caller does this by hand.
  #adoptFavorites(favorites) {
    this.#configuration.favorites = favorites;
    this.#renderFavoriteChips();
    this.#updateFavoritesVisibility();
  }

  // The one rule for whether a count applies: the setting is on and the form,
  // not the typed phrase, is what would be counted.
  get #countApplies() {
    return this.#countEnabled && !this.#tokenMode;
  }

  // Is anything picked at all? In token view the phrase can hold tokens the
  // form cannot mirror, so the typed field decides there.
  #isPicked() {
    return this.#tokenMode
      ? '' !== this.#tokenField.value.trim()
      : this.#hasSavableFilter();
  }

  // Is there anything worth saving as a favorite? Mirrors what #collectFormState
  // feeds the serialize endpoint, so freetext and the two scopes count too, not
  // just tab criteria.
  #hasSavableFilter() {
    const state = this.#collectFormState();

    return Object.keys(state.states).length > 0
      || '' !== state.site
      || state.pageScope > 0
      || '' !== state.freetext.trim();
  }

  /**
   * @param {boolean} activated - true when the user picked this tab outright
   *   (click, Enter, Space) rather than arrowing onto it. Only then does focus
   *   move on into the panel: while arrow-browsing it has to stay in the
   *   navigation, or the next arrow press would have nothing to move from.
   */
  #switchTab(identifier, activated = false) {
    this.#activeTab = identifier;
    // The popover covers the panel that is about to show.
    this.#help.close();
    // Picking a tab directly always exits search mode - otherwise the results
    // list and the newly-shown panel would be visible at the same time.
    const filterSearch = this.#modal.querySelector('[data-role="filter-search"]');
    // #renderNavigation() always renders it, unconditionally - unlike the site
    // scope or page scope controls, there is no configuration that omits it.
    /* v8 ignore next 3 */
    if (filterSearch) {
      filterSearch.value = '';
    }
    this.#resultsPanel.hidden = true;
    this.#modal.querySelectorAll('.pagetree-facets__nav-item').forEach((el) => {
      const isActive = el.dataset.tab === identifier;
      el.classList.toggle('active', isActive);
      // The active item is the navigation's single tab stop, which is what makes
      // one Tab press land in the panel (see the keydown handler in
      // #renderNavigation). aria-current carries the same state for assistive
      // technology, since without role="tab" there is no aria-selected to set.
      el.tabIndex = isActive ? 0 : -1;
      if (isActive) {
        el.setAttribute('aria-current', 'true');
      } else {
        el.removeAttribute('aria-current');
      }
    });
    this.#modal.querySelectorAll('.pagetree-facets__panel').forEach((el) => {
      el.hidden = el.dataset.panel !== identifier;
    });

    if (!activated) {
      return;
    }
    // Runs after the panel was unhidden above - offsetParent is only meaningful
    // once it is actually rendered, and controls behind a proxy (the visually
    // hidden switch inputs) must not swallow the focus.
    //
    // jsdom implements no layout at all, so offsetParent is always null there
    // regardless of visibility (see vitest.config.js's own docblock on this) -
    // `target` can therefore never be found under this suite, only in a real
    // browser (see Tests/Playwright). `panel` itself is only null for an
    // `identifier` with no matching panel, which #switchTab() is never called
    // with in practice.
    /* v8 ignore start */
    const panel = this.#modal.querySelector(`.pagetree-facets__panel[data-panel="${identifier}"]`);
    const target = [...panel?.querySelectorAll('input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])') ?? []]
      .find((el) => !el.disabled && null !== el.offsetParent);
    if (target) {
      target.focus();

      return;
    }
    /* v8 ignore stop */
    // `panel` is only null for an identifier with no matching panel at all -
    // #switchTab() is never actually called with one (nav items and the
    // favorites item both carry a real, existing identifier).
    /* v8 ignore next 5 */
    if (panel) {
      // An options-less panel (e.g. favorites before anything is saved) still has
      // to receive focus, or activating it would leave focus behind in the nav.
      panel.tabIndex = -1;
      panel.focus();
    }
  }

  // Coalesce per-keystroke refreshes: the full pass below walks every control
  // in the modal (chips, nav counts, apply state) twice over, which is wasted
  // work between keystrokes. 100ms is imperceptible for the indicators.
  #scheduleRefresh() {
    clearTimeout(this.#refreshDebounce);
    this.#refreshDebounce = setTimeout(() => this.#refreshActiveIndicators(), 100);
  }

  async #requestCount() {
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_count)
      .post(this.#collectFormState());
    const { count } = await response.resolve();

    return count;
  }

  // Rebuild the active-filter chips and nav dots from the current control state.
  // Called on open and after every change so the header always mirrors reality.
  //
  // @param {boolean} showLoadingImmediately - forwarded to LiveCount.schedule():
  //   false for callers where nothing the count depends on actually changed.
  #refreshActiveIndicators(showLoadingImmediately = true) {
    // #row is built synchronously in #render(), before #build() returns and
    // before any control/change listener that could call this exists.
    /* v8 ignore next 3 */
    if (!this.#row) {
      return;
    }
    const criteria = [...this.#titleCriterion(), ...this.#collectActiveCriteria()];
    // Clear all and the actions act on the whole phrase, so they follow whether
    // anything is picked - a scope alone counts, not just chips.
    this.#row.update({
      chips: criteria.map((criterion) => this.#renderChip(criterion)),
      savable: this.#isPicked(),
    });
    // Covers the programmatic paths (clear all, chip removal, search-result
    // proxies) that change controls without firing events on the wrapper.
    this.#refreshApplyState();
    this.#liveCount.schedule(showLoadingImmediately);

    const counts = new Map();
    for (const criterion of criteria) {
      if (null !== criterion.tab) {
        counts.set(criterion.tab, (counts.get(criterion.tab) ?? 0) + 1);
      }
    }
    this.#modal.querySelectorAll('.pagetree-facets__nav-item').forEach((item) => {
      // The favorites tab is not a filter criterion, so it never carries a count.
      if (item.dataset.tab === this.#favoritesTabId) {
        return;
      }
      this.#setNavCount(item, counts.get(item.dataset.tab) ?? 0);
    });
    // The headings (Select none, the selection count) read the same controls.
    this.#modal.querySelectorAll('.pagetree-facets__panel:not(.pagetree-facets__panel--favorites)').forEach(refreshPanel);
  }

  // Clear all: every criterion in place, freetext and scope included. Stays in
  // the modal, Apply still has to confirm.
  #resetAll() {
    this.#modal.querySelectorAll('.pagetree-facets__body [name]').forEach(clearControl);
    this.#searchField.setFreetext('');
    this.#scope?.reset();
    // Clear all clears everything, so the token field (the other editable view)
    // has to go empty too - otherwise it would re-seed the just-cleared form.
    if (this.#tokenMode) {
      this.#cancelTokenTimers();
      this.#tokenField.value = '';
    }
    this.#refreshActiveIndicators();
  }

  #setNavCount(item, count) {
    let badge = item.querySelector('.pagetree-facets__nav-count');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'pagetree-facets__nav-count';
        item.append(badge);
      }
      badge.textContent = String(count);
    } else {
      badge?.remove();
    }
  }

  // The page title is a criterion like any other, so it gets a chip too. It
  // belongs to no facet, which is why its tab is null and no nav item counts it.
  #titleCriterion() {
    const value = this.#searchField.freetext.value.trim();
    if ('' === value) {
      return [];
    }
    const prefix = TYPO3.lang?.['pagetreeFacets.modal.criterion.title'] ?? 'Title';

    return [{ tab: null, prefix, value, label: `${prefix}: ${value}`, remove: () => this.#searchField.setFreetext('') }];
  }

  // One entry per selected value across all tabs. Each carries a human label and
  // a `remove` closure bound to the concrete control, so deselecting a chip just
  // unsets that control and lets the change listener refresh everything.
  #collectActiveCriteria() {
    const criteria = [];
    for (const tab of this.#configuration.tabs) {
      const fields = distinctFields(tab);
      const nameCounts = fieldNameCounts(tab);
      // A name that occurs more than once in the raw (non-deduplicated) field
      // list is bucketed (e.g. RecordsTab's `table` split into TYPO3 Core/News/
      // Other, ContentElementTab's `ce` split per wizard group) - each field's
      // `label` there is a section heading, not a criterion name, so those
      // always fall back to the tab label. Only among the remaining,
      // non-bucketed names does it make sense to prefix with the field label,
      // and only when there is more than one of them (e.g. Activity: "Last
      // updated" vs "Created") - otherwise the tab label reads cleaner and a
      // single field would just repeat itself.
      const nonBucketedCount = fields.filter((field) => 1 === nameCounts.get(field.name)).length;
      for (const field of fields) {
        // fields (= distinctFields(tab)) and nameCounts are both built from
        // the same tab.configuration.fields, so field.name is always a key
        // here - `?? 0` guards a lookup miss that cannot actually happen.
        /* v8 ignore next */
        const bucketed = (nameCounts.get(field.name) ?? 0) > 1;
        const prefix = bucketed ? tab.label : (nonBucketedCount > 1 ? field.label : tab.label);
        const inputs = this.#modal.querySelectorAll(`[name="${tab.identifier}[${field.name}]"]`);
        for (const input of inputs) {
          if (input.tagName === 'SELECT') {
            for (const option of input.selectedOptions) {
              criteria.push(this.#criterion(prefix, tab, option.textContent.trim() || option.value, () => { option.selected = false; }));
            }
          } else if (input.type === 'checkbox' || input.type === 'radio') {
            // Not the neutral option ("Any time"): it is the absence of a criterion.
            if (input.checked && '' !== input.value) {
              // Scoped to the dedicated label span, not the whole <label>'s
              // textContent - that would also pick up the visually-hidden
              // option-description span (see optionHelp in Filter/form-controls.js).
              const label = input.closest('label')?.querySelector('.pagetree-facets__option-label')?.textContent.trim() || input.value;
              criteria.push(this.#criterion(prefix, tab, label, () => clearControl(input)));
            }
          } else if (this.#effectiveValue(input).trim() !== '') {
            const label = input.dataset.label || input.value.trim();
            criteria.push(this.#criterion(prefix, tab, label, () => clearControl(input)));
          }
        }
      }
    }
    return criteria;
  }

  // Does the current selection differ from the phrase the tree is actually
  // filtered by? Three things depend on the answer - the Apply button, the
  // pending notice and the close guard - so this stays the only place that
  // decides, and they can never disagree.
  #isDirty() {
    if (null === this.#baselineState) {
      return false;
    }
    if (this.#tokenMode) {
      // The form-state baseline no longer describes what is authoritative, so
      // diff the typed phrase against the one already applied to the tree.
      return this.#tokenField.value.trim() !== this.#currentPhrase.trim();
    }
    return JSON.stringify(this.#collectFormState()) !== this.#baselineState;
  }

  #refreshApplyState() {
    if (!this.#applyButton || null === this.#baselineState) {
      return;
    }
    const dirty = this.#isDirty();
    // Applying an unchanged filter is a no-op, so the button stays disabled
    // until something actually differs - which also makes it obvious that
    // picking a criterion is not applying it.
    this.#applyButton.disabled = !dirty;
    // The notice follows the dirty state, not the selection: the last chip
    // removed while the tree is still filtered needs it most of all.
    const picked = this.#isPicked();
    this.#status.update({ picked, dirty, countable: this.#countApplies && picked });
  }

  // Closing with a selection that was never applied. Three options rather than a
  // two-button warning: re-picking a filter is cheap, so a plain "are you sure"
  // on every ESC would be friction - offering the likely intent as well turns the
  // interception into a shortcut. Buttons with a `trigger` do not auto-dismiss in
  // core, so each branch closes the confirmation itself.
  #confirmPendingSelection() {
    const confirmation = Modal.confirm(
      TYPO3.lang?.['pagetreeFacets.modal.pendingConfirm.title'] ?? 'Selection not applied',
      TYPO3.lang?.['pagetreeFacets.modal.pendingConfirm.message']
        ?? 'You picked filter criteria but never applied them, so the page tree is unchanged.',
      SeverityEnum.warning,
      [
        {
          // ESC and the backdrop close only the confirmation, which lands on this
          // same branch - the safe one - and leaves the filter modal open.
          text: TYPO3.lang?.['pagetreeFacets.modal.pendingConfirm.back'] ?? 'Keep editing',
          btnClass: 'btn-default',
          trigger: () => { confirmation.hideModal(); },
        },
        {
          text: TYPO3.lang?.['pagetreeFacets.modal.pendingConfirm.discard'] ?? 'Discard selection',
          // Neutral: discarding loses nothing that cannot be picked again.
          btnClass: 'btn-default',
          trigger: () => {
            confirmation.hideModal();
            // Without this the guard would intercept the second attempt as well.
            this.#skipCloseGuard = true;
            this.#modal?.hideModal();
          },
        },
        {
          text: TYPO3.lang?.['pagetreeFacets.modal.pendingConfirm.apply'] ?? 'Apply and close',
          btnClass: 'btn-primary',
          // #serializeAndApply() closes the modal and bypasses the guard itself.
          trigger: () => {
            confirmation.hideModal();
            this.#serializeAndApply();
          },
        },
      ],
    );
  }

  // For dataset.picker controls (currently: user-picker), the visible .value is
  // a display label / in-progress query, not the wire value - dataset.value is
  // the source of truth (absent/empty = no selection yet).
  #effectiveValue(input) {
    return undefined !== input.dataset.picker ? (input.dataset.value ?? '') : input.value;
  }

  // `label` stays the joined form: it is the chip's accessible name, which has to
  // read as one phrase no matter how the two halves are styled apart visually.
  #criterion(prefix, tab, valueLabel, remove) {
    return { tab: tab.identifier, prefix, value: valueLabel, label: `${prefix}: ${valueLabel}`, remove };
  }

  #renderChip(criterion) {
    return renderChip(criterion, () => {
      criterion.remove();
      this.#refreshActiveIndicators();
      // Unsetting a control fires no change event, so the phrase is told here.
      this.#scheduleTokenFieldSync();
    });
  }

  // Enter token view: reveal the editable phrase field seeded from the current
  // form (serialized *before* the flag flips). The form stays fully editable
  // and becomes the other half of a two-way sync - not a read-only mirror.
  async #toggleTokenMode() {
    if (this.#tokenMode) {
      this.#exitTokenMode();
      return;
    }
    const phrase = await this.#computePhrase();
    this.#tokenMode = true;
    this.#tokenField.value = phrase;
    this.#setTextMode(true);
    this.#tokenField.focus();
    // A refresh armed during the await above must not land in text mode, and
    // withdrawing the count also clears a skeleton a request left in flight.
    this.#liveCount.cancel();
    this.#status.setCount(null);
    this.#refreshActiveIndicators();
    this.#refreshApplyState();
  }

  #exitTokenMode() {
    this.#cancelTokenTimers();
    this.#tokenMode = false;
    this.#setTextMode(false);
    // The form already mirrors the last reflected phrase, so there is nothing
    // to sync back - just restore the indicators/Apply state for form editing.
    this.#refreshActiveIndicators();
    this.#refreshApplyState();
  }

  // The phrase carries the scope itself, so the chip leaves with the freetext.
  #setTextMode(on) {
    this.#searchField.setTextMode(on);
    if (this.#scope) {
      this.#scope.close();
      this.#scope.element.hidden = on;
    }
  }

  // Token field -> form: re-hydrate the whole form from the typed phrase so
  // chips, counts and controls show what it resolves to. The field itself is
  // never rebuilt, so the caret stays put; a sequence guard drops out-of-order
  // responses from fast typing. Rebuilding fires no input events, so this never
  // triggers the reverse (form -> field) sync.
  async #reflectTokenQuery() {
    const seq = ++this.#reflectSeq;
    const configuration = await this.#requestConfiguration(this.#tokenField.value);
    // A newer keystroke won, or token view was left while the request was in
    // flight - either way this response is stale.
    if (seq !== this.#reflectSeq || !this.#tokenMode) {
      return;
    }
    this.#adoptConfiguration(configuration);
  }

  async #requestConfiguration(phrase) {
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_configuration)
      .withQueryArguments({ phrase })
      .get();

    return response.resolve();
  }

  // Replace the hydrated state wholesale and bring every derived surface with
  // it. The order is the point: the panels hold the controls that the chips,
  // counts and Apply state are read from, so they have to exist first.
  #adoptConfiguration(configuration) {
    this.#configuration = configuration;
    this.#populatePanels();
    this.#syncHeaderControlsFromConfig();
    this.#refreshActiveIndicators();
    this.#refreshApplyState();
  }

  // Form -> token field: mirror a structured edit back into the phrase. Only
  // active in token view; debounced like the reverse direction. Writing the
  // field value programmatically fires no input event, so it does not loop back
  // into #reflectTokenQuery. Trade-off: re-serializing from the form canonicalises
  // the phrase and drops tokens the form cannot represent (unknown / disabled).
  #scheduleTokenFieldSync() {
    if (!this.#tokenMode) {
      return;
    }
    this.#cancelTokenTimers();
    this.#syncTimer = window.setTimeout(() => this.#syncTokenFieldFromForm(), 250);
  }

  async #syncTokenFieldFromForm() {
    const phrase = await this.#serializeForm();
    if (!this.#tokenMode) {
      return; // token view was left while the request was in flight
    }
    this.#tokenField.value = phrase;
    this.#refreshApplyState();
  }

  // Drop any pending propagation in either direction. Called whenever a surface
  // is touched (so the last-touched one wins) or token view is left/reset.
  #cancelTokenTimers() {
    window.clearTimeout(this.#reflectTimer);
    window.clearTimeout(this.#syncTimer);
  }

  // Freetext and the scope live outside the panels #populatePanels rebuilds,
  // so they are brought in step here for leaving token view to show a correct form.
  #syncHeaderControlsFromConfig() {
    this.#searchField.setFreetext(this.#configuration.freetext ?? '');
    this.#scope?.hydrate(this.#configuration);
  }

  // The only path to the tree: everything else in the modal selects, this one
  // applies.
  async #serializeAndApply() {
    const phrase = await this.#computePhrase();
    // hideModal() runs before #onApply(), and neither #baselineState nor
    // #currentPhrase is refreshed afterwards - so the state still counts as
    // dirty here and the close guard would pop its dialog on the apply path
    // itself.
    this.#skipCloseGuard = true;
    this.#modal?.hideModal();
    this.#onApply?.(phrase);
  }

  // Same serialization Apply uses, factored out so "copy link" can share it -
  // both need the canonical phrase for whatever is currently configured in
  // the modal, not just what has already been applied to the tree.
  async #computePhrase() {
    if (this.#tokenMode) {
      // The field is authoritative in token view; return it verbatim so unknown
      // or otherwise unrepresentable tokens survive Apply / Copy link / Save
      // (unless a form edit has already re-serialized it - see #syncTokenField).
      return this.#tokenField.value.trim();
    }
    return this.#serializeForm();
  }

  async #serializeForm() {
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_serialize)
      .post(this.#collectFormState());
    const { phrase } = await response.resolve();
    return phrase;
  }

  // Everything the serialize endpoint needs, read straight off the live
  // controls. Kept separate from #computePhrase() because the Apply button's
  // enabled state compares this on every keystroke - that has to stay a local
  // DOM read, with no round trip.
  #collectFormState() {
    const states = {};
    for (const tab of this.#configuration.tabs) {
      const state = {};
      for (const field of distinctFields(tab)) {
        const inputs = this.#modal.querySelectorAll(`[name="${tab.identifier}[${field.name}]"]`);
        const values = [];
        for (const input of inputs) {
          if (input.tagName === 'SELECT') {
            values.push(...Array.from(input.selectedOptions).map((o) => o.value));
          } else if (input.type === 'checkbox' || input.type === 'radio') {
            if (input.checked && '' !== input.value) {
              values.push(input.value);
            }
          } else if (this.#effectiveValue(input) !== '') {
            values.push(this.#effectiveValue(input));
          }
        }
        if (values.length) {
          state[field.name] = values;
        }
      }
      if (Object.keys(state).length) {
        states[tab.identifier] = state;
      }
    }
    // The scope menu answers with the page open right now, not whatever page a
    // previously-hydrated "under:" token pointed at: picking "below" means "here".
    const { site, pageScope } = this.#scope?.value ?? { site: '', pageScope: 0 };
    const freetext = this.#searchField.freetext.value;

    return { states, site, pageScope, freetext };
  }

  // Copies the current URL (module, page id, ...) with the filter phrase
  // attached as a query param, so opening the link reproduces this exact
  // view - not just the filter in isolation. facets-toolbar.js reads the same
  // param back out on load and applies it to the tree.
  async #copyLink() {
    const phrase = await this.#computePhrase();
    const url = new URL(window.location.href);
    url.searchParams.set('pagetreeFacetsFilter', phrase);
    try {
      await navigator.clipboard.writeText(url.toString());
      Notification.success(
        TYPO3.lang?.['pagetreeFacets.modal.linkCopied.title'] ?? 'Link copied',
        TYPO3.lang?.['pagetreeFacets.modal.linkCopied.message'] ?? 'The filter link was copied to your clipboard.',
      );
    } catch {
      Notification.error(
        TYPO3.lang?.['pagetreeFacets.modal.linkCopyFailed.title'] ?? 'Copy failed',
        TYPO3.lang?.['pagetreeFacets.modal.linkCopyFailed.message'] ?? 'Could not copy the link to your clipboard.',
      );
    }
  }

}

export default new FacetsModal();
