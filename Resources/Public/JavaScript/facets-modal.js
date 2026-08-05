/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Modal from '@typo3/backend/modal.js';
import Notification from '@typo3/backend/notification.js';
import AjaxRequest from '@typo3/core/ajax/ajax-request.js';

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
  #chips = null;
  #active = null;
  #utility = null;
  #actions = null;
  #applyButton = null;
  #baselineState = null;
  #resultsPanel = null;
  #root = null;
  #nextHelpId = 0;
  #nextListId = 0;
  #currentPageId = null;
  #favoritesList = null;
  // Client-side pseudo-tab: favorites are not a filter criterion (no token
  // keys), so they never come from the server tab list - the modal owns this
  // identifier and renders the nav item and panel for it itself.
  #favoritesTabId = '__favorites';
  #favoritesNavItem = null;

  async open(currentPhrase, currentPageId, onApply) {
    this.#onApply = onApply;
    this.#currentPageId = currentPageId;
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_configuration)
      .withQueryArguments({ phrase: currentPhrase })
      .get();
    this.#configuration = await response.resolve();
    if (!this.#configuration.tabs.length) {
      return;
    }
    this.#activeTab = (this.#configuration.tabs.find((tab) => !this.#isTabEmpty(tab)) ?? this.#configuration.tabs[0]).identifier;

    this.#modal = Modal.advanced({
      title: TYPO3.lang?.['pagetreeFacets.modal.title'] ?? 'Filter page tree',
      size: Modal.sizes.large,
      content: this.#render(),
      buttons: [
        {
          text: TYPO3.lang?.['pagetreeFacets.modal.close'] ?? 'Close',
          btnClass: 'btn-default',
          trigger: () => { this.#modal?.hideModal(); },
        },
        {
          text: TYPO3.lang?.['pagetreeFacets.modal.apply'] ?? 'Apply',
          btnClass: 'btn-primary',
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
        // reach the help toggle or "copy link".
        if (event.key === 'Enter' && !['TEXTAREA', 'BUTTON'].includes(event.target.tagName)) {
          event.preventDefault();
          this.#serializeAndApply();
        }
      });
      // Populate the active-filter chips from the hydrated state once the modal
      // is in the DOM (the chip list is derived from the live form controls).
      this.#refreshActiveIndicators();

      // Baseline for the Apply button: the state as hydrated from the phrase
      // already applied to the tree. Applying an unchanged filter is a no-op, so
      // the button stays disabled until something actually differs - which also
      // makes it obvious that picking a criterion is not applying it.
      this.#applyButton = this.#modal.querySelector('button[name="pagetree-facets-apply"]');
      this.#baselineState = JSON.stringify(this.#collectFormState());
      this.#refreshApplyState();
    });
  }

  #render() {
    const wrap = document.createElement('div');
    wrap.className = 'pagetree-facets';
    wrap.append(this.#renderHeader(), this.#renderBody());
    // One listener for the whole content: the body-level ones never see the
    // header controls (freetext, site scope, page scope), which change the
    // filter just as much.
    wrap.addEventListener('change', () => this.#refreshApplyState());
    wrap.addEventListener('input', () => this.#refreshApplyState());
    // Kept for reparenting the user-picker dropdown out of the scrolling panel
    // (see #showUserResults). Modal.advanced() renders `content` into its own
    // Lit-managed custom element - appending directly to that element is
    // invisible (nodes it did not create are outside its render tree), but
    // this wrapper is plain DOM we fully own, so appending here is safe.
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
    search.append(this.#renderFreetext());
    if ((this.#configuration.sites ?? []).length > 1) {
      search.append(this.#renderSiteScope());
    }
    const help = this.#renderHelp();
    search.append(this.#renderHelpToggle(help));
    header.append(search, help);

    // Utility row: the page scope on the left, the filter-wide actions on the
    // right. They share a row so the active-filter area below spends its height
    // on chips only, instead of a full row on two links.
    this.#utility = document.createElement('div');
    this.#utility.className = 'pagetree-facets__utility';

    // No page open (e.g. a module without a page context) -> nothing to
    // scope to, so the control would be permanently unusable; skip it
    // entirely rather than show a checkbox that can never be checked.
    if (this.#currentPageId) {
      this.#utility.append(this.#renderPageScope());
    }

    const copyLink = document.createElement('button');
    copyLink.type = 'button';
    copyLink.className = 'pagetree-facets__copy-link btn btn-sm btn-link d-inline-flex align-items-center gap-1';
    const copyLinkIcon = document.createElement('typo3-backend-icon');
    copyLinkIcon.setAttribute('identifier', 'actions-clipboard');
    copyLinkIcon.setAttribute('size', 'small');
    copyLink.append(copyLinkIcon, document.createTextNode(TYPO3.lang?.['pagetreeFacets.modal.copyLink'] ?? 'Copy link'));
    copyLink.addEventListener('click', () => this.#copyLink());

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'pagetree-facets__reset btn btn-sm btn-link d-inline-flex align-items-center gap-1';
    const resetIcon = document.createElement('typo3-backend-icon');
    resetIcon.setAttribute('identifier', 'actions-refresh');
    resetIcon.setAttribute('size', 'small');
    reset.append(resetIcon, document.createTextNode(TYPO3.lang?.['pagetreeFacets.modal.reset'] ?? 'Reset'));
    reset.addEventListener('click', () => this.#resetAll());

    // "Save current filter" sits alongside "Copy link" - both export the phrase
    // currently configured. The toggle reveals an inline name form (below), so
    // the actions row itself stays a single tidy line of links.
    const { toggle: saveToggle, form: saveForm } = this.#buildSaveFavorite();

    // Sharing, saving or resetting an empty filter is meaningless, so the actions
    // only appear once something is active (see #refreshActiveIndicators).
    this.#actions = document.createElement('div');
    this.#actions.className = 'pagetree-facets__actions';
    this.#actions.hidden = true;
    this.#actions.append(copyLink, saveToggle, reset);
    this.#utility.append(this.#actions);
    header.append(this.#utility, saveForm);

    // Active-filter row: the removable chips mirroring the current tab criteria.
    this.#active = document.createElement('div');
    this.#active.className = 'pagetree-facets__active';
    this.#active.hidden = true;

    this.#chips = document.createElement('div');
    this.#chips.className = 'pagetree-facets__chips';
    this.#active.append(this.#chips);

    header.append(this.#active);
    return header;
  }

  #renderBody() {
    const body = document.createElement('div');
    body.className = 'pagetree-facets__body row';
    body.append(this.#renderNavigation(), this.#renderPanels());
    // Keep chips and per-tab counts in sync with the live controls.
    body.addEventListener('change', () => this.#refreshActiveIndicators());
    body.addEventListener('input', (event) => {
      if (event.target.matches('input[type="text"]')) {
        this.#refreshActiveIndicators();
      }
    });
    return body;
  }

  #renderNavigation() {
    const nav = document.createElement('div');
    nav.className = 'col-3 pagetree-facets__nav';
    nav.append(this.#renderFilterSearch());
    const list = document.createElement('ul');
    list.className = 'list-unstyled';

    // Favorites lead the navigation, above every filter group - quick access to
    // saved filters is the first thing an editor reaches for.
    list.append(this.#renderFavoritesNavItem());

    // Tabs arrive priority-ordered, so their groups interleave (content, state,
    // content, ...). Bucket them by group first, keeping first-seen order, so
    // each group heading is rendered exactly once.
    const groups = new Map();
    for (const tab of this.#configuration.tabs) {
      const key = tab.group ?? '';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(tab);
    }

    for (const [group, tabs] of groups) {
      if (group !== '') {
        const heading = document.createElement('li');
        heading.className = 'pagetree-facets__nav-group text-muted text-uppercase';
        heading.textContent = group;
        list.append(heading);
      }
      for (const tab of tabs) {
        list.append(this.#renderNavItem(tab));
      }
    }
    nav.append(list);
    return nav;
  }

  #renderNavItem(tab) {
    const empty = this.#isTabEmpty(tab);
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pagetree-facets__nav-item'
      + (tab.identifier === this.#activeTab ? ' active' : '')
      + (empty ? ' is-empty' : '');
    button.dataset.tab = tab.identifier;
    button.disabled = empty;
    if (empty) {
      button.title = TYPO3.lang?.['pagetreeFacets.modal.tabEmpty'] ?? 'No options available';
    }
    // Label text kept in its own node so the active-criteria dot can be toggled
    // live (see #setNavDot) without clobbering the label.
    const text = document.createElement('span');
    text.textContent = tab.label;
    button.append(text);
    if (!empty) {
      button.addEventListener('click', () => this.#switchTab(tab.identifier));
    }
    item.append(button);
    return item;
  }

  // A tab is "empty" when every field is a choice type (checkbox-group / select
  // / radio-presets) with zero options - e.g. Translations on a single-language
  // site. Freeform fields (text, user-picker) are always usable regardless of
  // options, so their presence means the tab is never considered empty.
  #isTabEmpty(tab) {
    const fields = tab.configuration.fields ?? [];
    if (!fields.length) {
      return true;
    }
    const choiceTypes = ['checkbox-group', 'select', 'radio-presets'];
    return fields.every((field) => choiceTypes.includes(field.type) && (field.options ?? []).length === 0);
  }

  #renderPanels() {
    const panels = document.createElement('div');
    panels.className = 'col-9 pagetree-facets__panels';
    panels.append(this.#renderFavoritesPanel());
    for (const tab of this.#configuration.tabs) {
      panels.append(this.#renderPanel(tab));
    }
    this.#resultsPanel = document.createElement('div');
    this.#resultsPanel.className = 'pagetree-facets__search-results';
    this.#resultsPanel.hidden = true;
    panels.append(this.#resultsPanel);
    return panels;
  }

  // Cross-tab search: matches field/option labels already present in the
  // hydrated configuration (client-side only). While it has text, it replaces
  // the tab panels with a flat, clickable results list; clearing it restores
  // the previously active tab.
  #renderFilterSearch() {
    const wrap = document.createElement('div');
    wrap.className = 'pagetree-facets__filter-search';
    const input = document.createElement('input');
    input.className = 'form-control form-control-sm';
    input.type = 'search';
    input.dataset.role = 'filter-search';
    const label = TYPO3.lang?.['pagetreeFacets.modal.search'] ?? 'Search filters';
    input.placeholder = label;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => this.#applyFilterSearch(input.value));
    wrap.append(this.#clearable(input));
    return wrap;
  }

  #applyFilterSearch(query) {
    const trimmed = query.trim().toLowerCase();
    if ('' === trimmed) {
      this.#resultsPanel.hidden = true;
      this.#modal.querySelectorAll('.pagetree-facets__panel').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== this.#activeTab;
      });
      this.#modal.querySelectorAll('.pagetree-facets__nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.tab === this.#activeTab);
      });
      return;
    }
    this.#modal.querySelectorAll('.pagetree-facets__panel').forEach((panel) => { panel.hidden = true; });
    this.#modal.querySelectorAll('.pagetree-facets__nav-item').forEach((item) => item.classList.remove('active'));
    this.#renderSearchResults(this.#findFilterMatches(trimmed));
    this.#resultsPanel.hidden = false;
  }

  // @return {tab, field, option}[] - text-type/user-picker fields have no
  // enumerable options and are deliberately excluded from matching.
  #findFilterMatches(query) {
    const choiceTypes = ['checkbox-group', 'select', 'radio-presets'];
    const matches = [];
    for (const tab of this.#configuration.tabs) {
      for (const field of tab.configuration.fields ?? []) {
        if (!choiceTypes.includes(field.type)) {
          continue;
        }
        for (const option of field.options ?? []) {
          if (option.label.toLowerCase().includes(query)) {
            matches.push({ tab, field, option });
          }
        }
      }
    }
    return matches;
  }

  #renderSearchResults(matches) {
    this.#resultsPanel.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'pagetree-facets__search-empty text-muted';
      empty.textContent = TYPO3.lang?.['pagetreeFacets.modal.noSearchResults'] ?? 'No matching filters';
      this.#resultsPanel.append(empty);
      return;
    }
    const list = document.createElement('ul');
    list.className = 'pagetree-facets__search-list list-unstyled';
    for (const match of matches) {
      list.append(this.#renderSearchResultItem(match));
    }
    this.#resultsPanel.append(list);
  }

  // Mirrors the SAME control the matching tab panel already rendered (panels
  // stay in the DOM, merely hidden) as a real checkbox/radio - not a plain
  // button - so a result reads exactly like its field's own list. Toggling
  // the proxy writes through to the real control and dispatches its change
  // event, so chips/nav counts refresh without any extra wiring.
  #renderSearchResultItem({ tab, field, option }) {
    const isRadio = 'radio-presets' === field.type;
    const realInput = this.#modal.querySelector(
      `[name="${tab.identifier}[${field.name}]"][value="${CSS.escape(option.value)}"]`,
    );
    const item = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'pagetree-facets__search-result form-check d-flex align-items-center gap-2'
      + (isRadio ? '' : ' form-switch');

    const proxy = document.createElement('input');
    proxy.className = 'form-check-input';
    proxy.type = isRadio ? 'radio' : 'checkbox';
    if (isRadio) {
      // A synthetic, list-scoped group name - native mutual exclusion between
      // matches for the same field, without colliding with the real field's
      // bracketed name (which the generic collectors key off of).
      proxy.name = `search-radio-${tab.identifier}-${field.name}`;
    } else {
      proxy.setAttribute('role', 'switch');
    }
    proxy.checked = Boolean(realInput?.checked);
    proxy.disabled = !realInput;
    proxy.addEventListener('change', () => {
      if (!realInput) {
        return;
      }
      realInput.checked = proxy.checked;
      realInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    label.append(proxy);

    if (option.icon) {
      const icon = document.createElement('typo3-backend-icon');
      icon.setAttribute('identifier', option.icon);
      icon.setAttribute('size', 'small');
      label.append(icon);
    }
    const text = document.createElement('span');
    text.className = 'pagetree-facets__search-result-label';
    text.textContent = option.label;
    label.append(text);

    const tabBadge = document.createElement('span');
    tabBadge.className = 'pagetree-facets__search-result-tab';
    tabBadge.textContent = tab.label;
    label.append(tabBadge);

    if (option.description) {
      label.title = option.description;
      label.append(this.#renderOptionHelp(proxy, option.description));
    }

    item.append(label);
    return item;
  }

  // Usage help, written for editors: how picking criteria behaves, not what the
  // token grammar looks like. The token syntax is mentioned once at the end as
  // an aside - editors work through these controls, not by typing tokens.
  // Collapsed by default; reference material, not a step in the flow.
  #renderHelp() {
    const panel = document.createElement('div');
    panel.className = 'alert alert-info pagetree-facets__help';
    panel.id = `pagetree-facets__help-${this.#nextHelpId++}`;
    panel.hidden = true;

    const intro = document.createElement('p');
    intro.textContent = TYPO3.lang?.['pagetreeFacets.modal.help.intro']
      ?? 'Pick one or more criteria to narrow the page tree down to the pages you are looking for.';
    panel.append(intro);

    const points = [
      ['combine', 'Criteria from different categories are combined: a page has to match all of them. Picking several options within one category means any of them is enough.'],
      ['chips', 'Everything you picked is listed above. Remove a single criterion with its ×, or start over with "Reset".'],
      // Only worth explaining while the control it describes is on screen.
      ...(this.#currentPageId
        ? [['scope', '"Search from current page down" limits the result to the page you currently have open and its subpages.']]
        : []),
      ['share', '"Copy link" copies a link to your current selection, so you can hand it to a colleague.'],
    ];
    const list = document.createElement('ul');
    list.className = 'pagetree-facets__help-points';
    for (const [key, fallback] of points) {
      const item = document.createElement('li');
      item.textContent = TYPO3.lang?.[`pagetreeFacets.modal.help.${key}`] ?? fallback;
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

  #renderHelpToggle(panel) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-default btn-icon pagetree-facets__help-toggle';
    const label = TYPO3.lang?.['pagetreeFacets.modal.help'] ?? 'Filter syntax';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', panel.id);
    const icon = document.createElement('typo3-backend-icon');
    icon.setAttribute('identifier', 'actions-info-circle');
    icon.setAttribute('size', 'small');
    button.append(icon);
    button.addEventListener('click', () => {
      const expand = panel.hidden;
      panel.hidden = !expand;
      button.setAttribute('aria-expanded', String(expand));
    });
    return button;
  }

  // Wraps a text-ish input so it carries a clear button while it has a value.
  // Clearing dispatches the same input/change events typing would, so chips,
  // per-tab counts, the cross-tab search and the user-picker's own listener all
  // react through their existing wiring rather than being special-cased here.
  #clearable(input) {
    const wrap = document.createElement('div');
    wrap.className = 'pagetree-facets__clearable';

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'pagetree-facets__clear';
    clear.textContent = '×';
    const label = TYPO3.lang?.['pagetreeFacets.modal.clear'] ?? 'Clear';
    clear.title = label;
    clear.setAttribute('aria-label', label);
    clear.hidden = '' === input.value;

    clear.addEventListener('click', () => {
      input.value = '';
      // Picker controls keep the wire value out of band (see #effectiveValue),
      // so clearing the visible text alone would leave the criterion active.
      delete input.dataset.value;
      delete input.dataset.label;
      clear.hidden = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.focus();
    });
    input.addEventListener('input', () => { clear.hidden = '' === input.value; });

    wrap.append(input, clear);
    return wrap;
  }

  #renderFreetext() {
    // Freetext must survive the modal round trip - it is a first-class
    // criterion (intersected engine-side), not decoration.
    const row = document.createElement('div');
    row.className = 'form-group pagetree-facets__freetext';
    const input = document.createElement('input');
    input.className = 'form-control';
    input.type = 'text';
    input.dataset.role = 'freetext';
    const freetextLabel = TYPO3.lang?.['pagetreeFacets.modal.freetext'] ?? 'Page title or UID';
    input.placeholder = freetextLabel;
    input.setAttribute('aria-label', freetextLabel);
    input.value = this.#configuration.freetext ?? '';
    row.append(this.#clearable(input));
    return row;
  }

  #renderSiteScope() {
    const row = document.createElement('div');
    row.className = 'form-group pagetree-facets__site';
    const select = document.createElement('select');
    select.className = 'form-select';
    select.dataset.role = 'site-scope';
    select.setAttribute('aria-label', TYPO3.lang?.['pagetreeFacets.modal.allSites'] ?? 'All sites');
    select.append(new Option(TYPO3.lang?.['pagetreeFacets.modal.allSites'] ?? 'All sites', ''));
    for (const site of this.#configuration.sites) {
      const option = new Option(site.identifier, site.identifier, false, site.identifier === this.#configuration.activeSite);
      select.append(option);
    }
    row.append(select);
    return row;
  }

  // "under:<uid>" scope - a quick toggle, not a picker: there is only ever
  // one meaningful value ("the page I have open right now"), unlike the site
  // dropdown's several named options. Re-checking it always captures
  // #currentPageId fresh at Apply time (see #computePhrase) rather than
  // preserving whatever page a previously-hydrated token pointed at.
  #renderPageScope() {
    const wrap = document.createElement('div');
    wrap.className = 'form-check pagetree-facets__page-scope';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input';
    checkbox.id = 'pagetree-facets__page-scope';
    checkbox.dataset.role = 'page-scope';
    checkbox.checked = null !== this.#configuration.pageScope;

    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.setAttribute('for', checkbox.id);
    label.textContent = TYPO3.lang?.['pagetreeFacets.modal.pageScope'] ?? 'Search from current page down';
    label.title = TYPO3.lang?.['pagetreeFacets.modal.pageScope.description']
      ?? 'Only includes the page you currently have open and its subpages.';

    wrap.append(checkbox, label);
    return wrap;
  }

  #renderPanel(tab) {
    const panel = document.createElement('div');
    panel.className = 'pagetree-facets__panel';
    panel.dataset.panel = tab.identifier;
    panel.hidden = tab.identifier !== this.#activeTab;
    for (const field of tab.configuration.fields ?? []) {
      panel.append(this.#renderField(tab, field));
    }
    return panel;
  }

  #renderField(tab, field) {
    const group = document.createElement('fieldset');
    group.className = 'form-group';
    const legend = document.createElement('legend');
    legend.className = 'form-label';
    legend.textContent = field.label;
    group.append(legend);
    const state = tab.state?.[field.name];

    if (field.type === 'user-picker') {
      group.append(this.#renderUserPicker(tab, field, state));
      return group;
    }

    if (field.type === 'checkbox-group' || field.type === 'radio-presets') {
      const isRadio = field.type === 'radio-presets';
      // Options live in their own grid wrapper, not the fieldset itself - a
      // <legend> that is a direct grid item gets extra browser-reserved space
      // around it (a long-standing cross-browser fieldset/legend quirk),
      // inflating the gap under the heading well beyond any margin we set.
      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'pagetree-facets__options';
      for (const option of field.options ?? []) {
        const label = document.createElement('label');
        // Checkboxes render as TYPO3's own toggle-switch style (form-switch,
        // the same classes core uses for boolean settings) instead of plain
        // browser checkboxes. Radios stay plain radios - a switch implies an
        // independent on/off, which does not fit a mutually-exclusive group.
        label.className = 'form-check d-flex align-items-center gap-1' + (isRadio ? '' : ' form-switch');
        const input = document.createElement('input');
        input.className = 'form-check-input';
        input.type = isRadio ? 'radio' : 'checkbox';
        if (!isRadio) {
          input.setAttribute('role', 'switch');
        }
        input.name = `${tab.identifier}[${field.name}]`;
        input.value = option.value;
        input.checked = Array.isArray(state) ? state.includes(option.value) : state === option.value;
        label.append(input);
        if (option.icon) {
          const icon = document.createElement('typo3-backend-icon');
          icon.setAttribute('identifier', option.icon);
          icon.setAttribute('size', 'small');
          label.append(icon);
        }
        const optionLabel = document.createElement('span');
        optionLabel.className = 'pagetree-facets__option-label';
        optionLabel.textContent = option.label;
        label.append(document.createTextNode(' '), optionLabel);
        if (option.description) {
          label.title = option.description;
          label.append(this.#renderOptionHelp(input, option.description));
        }
        optionsWrap.append(label);
      }
      group.append(optionsWrap);
      return group;
    }

    if (field.type === 'select') {
      const select = document.createElement('select');
      select.className = 'form-select';
      select.multiple = true;
      select.name = `${tab.identifier}[${field.name}]`;
      for (const option of field.options ?? []) {
        select.append(new Option(option.label, option.value, false, Array.isArray(state) && state.includes(option.value)));
      }
      group.append(select);
      return group;
    }

    const input = document.createElement('input');
    input.className = 'form-control';
    input.type = 'text';
    input.name = `${tab.identifier}[${field.name}]`;
    input.value = Array.isArray(state) ? (state[0] ?? '') : (state ?? '');
    if (field.placeholder) {
      // Purely a hint: the fieldset legend stays the accessible name, so this
      // never becomes a placeholder-as-label.
      input.placeholder = field.placeholder;
    }
    group.append(this.#clearable(input));
    return group;
  }

  // A visually-hidden span wired via aria-describedby on the control itself -
  // the caller also sets `title` on the enclosing label for a native mouse
  // tooltip; this covers keyboard/screen-reader users a bare `title` would
  // miss. No visible icon: it inflated .textContent (leaking the description
  // into active-filter chips, which read a checkbox's label text) and was
  // one more thing cluttering the row for a plain hover hint.
  #renderOptionHelp(input, description) {
    const descId = `pagetree-facets__option-help-${this.#nextHelpId++}`;
    input.setAttribute('aria-describedby', descId);

    const hiddenDescription = document.createElement('span');
    hiddenDescription.id = descId;
    hiddenDescription.className = 'visually-hidden';
    hiddenDescription.textContent = description;
    return hiddenDescription;
  }

  // Typeahead over be_users, backed by a small debounced AJAX search - one
  // single mechanism, not a search box plus a separate "Me" toggle (the two
  // used to show redundant, unstyled "Me"/"Me" text next to each other with
  // no indication which one was actually selected). "Me" is pinned as the
  // first suggestion whenever the dropdown opens, using the current user's
  // own record the server already has in memory (no round trip). The input's
  // visible value is a display label ("Me (admin)" or a picked user's own
  // label); the value actually serialized/collected lives in
  // input.dataset.value (uid or "me") - see the dataset.value fallback in
  // #collectActiveCriteria/#serializeAndApply.
  // ARIA "combobox with list autocomplete" pattern (WAI-ARIA APG): the input
  // keeps real DOM focus at all times, arrow keys move a highlighted
  // suggestion via aria-activedescendant, Enter selects it. This is not
  // decoration - the suggestion list is reparented far from the input in the
  // DOM (see #showUserResults's docblock), so plain Tab-key focus movement
  // into it is either unreachable or lands wildly out of sequence; letting
  // the browser's native Tab handling try was a real keyboard trap before
  // this rewrite (Tab moved focus nowhere useful, and the list would hide
  // itself out from under a focus that did land inside it).
  #renderUserPicker(tab, field, state) {
    const wrap = document.createElement('div');
    wrap.className = 'pagetree-facets__user-picker';

    const input = document.createElement('input');
    input.className = 'form-control';
    input.type = 'text';
    input.name = `${tab.identifier}[${field.name}]`;
    input.autocomplete = 'off';
    input.placeholder = TYPO3.lang?.['pagetreeFacets.modal.userSearchPlaceholder'] ?? 'Search backend user…';
    // Marks this control as "dataset.value is the source of truth" - the typed
    // text is a display-only query until a suggestion is picked, so the
    // generic collectors must never treat mid-typing text as a criterion.
    input.dataset.picker = '1';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');

    const results = document.createElement('ul');
    const resultsId = `pagetree-facets__user-results-${this.#nextListId++}`;
    results.id = resultsId;
    results.className = 'pagetree-facets__user-results list-unstyled';
    results.setAttribute('role', 'listbox');
    results.hidden = true;
    input.setAttribute('aria-controls', resultsId);

    const meLabel = TYPO3.lang?.['pagetreeFacets.modal.me'] ?? 'Me';
    const currentUser = field.currentUser?.uid ? field.currentUser : null;
    const currentUserLabel = currentUser ? `${meLabel} (${currentUser.username})` : meLabel;

    let highlighted = -1;
    const options = () => Array.from(results.querySelectorAll('[role="option"]'));

    const setHighlighted = (index) => {
      const items = options();
      highlighted = items.length ? ((index % items.length) + items.length) % items.length : -1;
      for (const [i, item] of items.entries()) {
        const isActive = i === highlighted;
        item.classList.toggle('is-highlighted', isActive);
        item.setAttribute('aria-selected', String(isActive));
        if (isActive) {
          item.scrollIntoView({ block: 'nearest' });
        }
      }
      if (highlighted > -1) {
        input.setAttribute('aria-activedescendant', items[highlighted].id);
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    };

    const selectUser = (value, label) => {
      input.value = label;
      input.dataset.value = value;
      input.dataset.label = label;
      this.#hideUserResults(input, results);
      input.focus();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const renderSuggestions = (users) => {
      results.replaceChildren();
      const items = currentUser ? [{ value: 'me', label: currentUserLabel }, ...users] : users;
      items.forEach((item, index) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.id = `${resultsId}-option-${index}`;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', 'false');
        // Reached via the input's own arrow-key handling, not Tab - a real
        // tabindex would put it back in the same broken position as before.
        button.tabIndex = -1;
        button.className = 'pagetree-facets__user-result';
        button.textContent = item.label;
        // Keeps focus on the input for mouse clicks too, so selecting a
        // suggestion never needs the blur/setTimeout dance to "just work".
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', () => selectUser(String(item.value ?? item.uid), item.label));
        li.append(button);
        results.append(li);
      });
      highlighted = -1;
      if (items.length) {
        this.#showUserResults(input, results);
      } else {
        this.#hideUserResults(input, results);
      }
    };

    const existingValue = Array.isArray(state) ? (state[0] ?? '') : (state ?? '');
    if ('me' === existingValue && currentUser) {
      input.value = currentUserLabel;
      input.dataset.value = 'me';
      input.dataset.label = currentUserLabel;
    } else if (existingValue) {
      input.value = existingValue;
      input.dataset.value = existingValue;
      this.#resolveUserLabel(existingValue).then((label) => {
        if (label && input.dataset.value === existingValue) {
          input.value = label;
          input.dataset.label = label;
          this.#refreshActiveIndicators();
        }
      });
    }

    let debounceTimer = null;
    // Guards against out-of-order AJAX responses: clearTimeout() only cancels
    // a debounced search that has not fired yet, not one already in flight.
    // Typing fast enough that an older request resolves after a newer one
    // would otherwise let the stale response overwrite the newer, correct
    // suggestions - each input event bumps the token, and a response is only
    // applied if it is still the most recent one requested.
    let searchToken = 0;
    // Pin "Me" as a suggestion the moment the field gains focus, before any
    // typing - the common case (filter by my own edits) needs no search at all.
    input.addEventListener('focus', () => {
      if (input.value.trim().length < 2) {
        searchToken += 1;
        renderSuggestions([]);
      }
    });

    input.addEventListener('input', () => {
      delete input.dataset.value;
      delete input.dataset.label;
      window.clearTimeout(debounceTimer);
      const query = input.value.trim();
      const token = ++searchToken;
      if (query.length < 2) {
        renderSuggestions([]);
        return;
      }
      debounceTimer = window.setTimeout(async () => {
        const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_users)
          .withQueryArguments({ q: query })
          .get();
        const { users } = await response.resolve();
        if (token !== searchToken) {
          return; // a newer query has started since - this response is stale
        }
        renderSuggestions(users);
      }, 300);
    });

    input.addEventListener('keydown', (event) => {
      if ('ArrowDown' === event.key) {
        event.preventDefault();
        if (results.hidden) {
          if (results.children.length) {
            this.#showUserResults(input, results);
          } else {
            renderSuggestions([]);
          }
        }
        setHighlighted(highlighted + 1);
      } else if ('ArrowUp' === event.key && !results.hidden) {
        event.preventDefault();
        setHighlighted(highlighted - 1);
      } else if ('Enter' === event.key && !results.hidden && highlighted > -1) {
        event.preventDefault();
        // Also stops this Enter from reaching the modal-wide "Enter applies
        // and closes" handler (bound higher up on .pagetree-facets) - picking
        // a suggestion should not also apply/close the whole modal.
        event.stopPropagation();
        options()[highlighted].click();
      } else if ('Escape' === event.key && !results.hidden) {
        event.preventDefault();
        this.#hideUserResults(input, results);
      }
    });

    input.addEventListener('blur', () => {
      // Delayed so a mouse click outside the input (that isn't one of our
      // own suggestion buttons, which prevent this via mousedown above) still
      // gets a chance to register before the list disappears.
      window.setTimeout(() => this.#hideUserResults(input, results), 150);
    });

    wrap.append(this.#clearable(input), results);
    return wrap;
  }

  // The dropdown lives inside .pagetree-facets__panels, which scrolls its own
  // content - an absolutely positioned child gets clipped by that overflow
  // once the input sits near the bottom of the visible area. Reparenting it to
  // the modal root and positioning it `absolute` against that same root
  // (coordinates relative to its own bounding box, not the viewport) escapes
  // that clipping entirely. Deliberately not `fixed`: the modal dialog may
  // itself establish a containing block (e.g. a transform-based open
  // animation), which would silently reinterpret viewport coordinates against
  // the dialog's box instead - .pagetree-facets never clips its own children,
  // so `absolute` against it is the safer bet.
  #showUserResults(input, results) {
    if (this.#root && results.parentElement !== this.#root) {
      this.#root.append(results);
    }
    const rootRect = this.#root.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    results.style.position = 'absolute';
    results.style.left = `${inputRect.left - rootRect.left}px`;
    results.style.top = `${inputRect.bottom - rootRect.top + 4}px`;
    results.style.width = `${inputRect.width}px`;
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (!results.dataset.scrollBound) {
      results.dataset.scrollBound = '1';
      // Scroll events on inner scrollable containers do not bubble - a capture
      // listener still sees them on the way down, regardless of which
      // ancestor scrolled.
      results.__hideOnScroll = () => this.#hideUserResults(input, results);
      document.addEventListener('scroll', results.__hideOnScroll, true);
    }
  }

  #hideUserResults(input, results) {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    if (results.__hideOnScroll) {
      document.removeEventListener('scroll', results.__hideOnScroll, true);
      delete results.__hideOnScroll;
      delete results.dataset.scrollBound;
    }
  }

  async #resolveUserLabel(uid) {
    try {
      const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_users)
        .withQueryArguments({ uid })
        .get();
      const { users } = await response.resolve();
      return users[0]?.label ?? null;
    } catch {
      return null;
    }
  }

  // Personal favorites: saved filter phrases, surfaced as a first-class tab at
  // the top of the navigation. The panel lists them (apply on click, × to
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
    button.className = 'pagetree-facets__nav-item'
      + (this.#favoritesTabId === this.#activeTab ? ' active' : '');
    button.dataset.tab = this.#favoritesTabId;
    const text = document.createElement('span');
    text.textContent = TYPO3.lang?.['pagetreeFacets.modal.favorites'] ?? 'Favorites';
    button.append(text);
    button.addEventListener('click', () => this.#switchTab(this.#favoritesTabId));
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
    panel.append(this.#favoritesList);
    this.#renderFavoriteChips();
    return panel;
  }

  #renderFavoriteChips() {
    const removeLabel = TYPO3.lang?.['pagetreeFacets.modal.removeFavorite'] ?? 'Remove favorite';
    this.#favoritesList.replaceChildren(...(this.#configuration.favorites ?? []).map((favorite, index) => {
      const row = document.createElement('div');
      row.className = 'pagetree-facets__favorite';

      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'pagetree-facets__favorite-apply';
      apply.title = favorite.tokenString;
      const label = document.createElement('span');
      label.className = 'pagetree-facets__favorite-label';
      label.textContent = favorite.label;
      const phrase = document.createElement('code');
      phrase.className = 'pagetree-facets__favorite-phrase';
      phrase.textContent = favorite.tokenString;
      apply.append(label, phrase);
      apply.addEventListener('click', () => this.#apply(favorite.tokenString));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'pagetree-facets__favorite-remove';
      remove.textContent = '×';
      remove.title = removeLabel;
      remove.setAttribute('aria-label', `${favorite.label} – ${removeLabel}`);
      remove.addEventListener('click', () => this.#removeFavorite(index));

      row.append(apply, remove);
      return row;
    }));
  }

  // Show the favorites tab only while there is at least one favorite. When the
  // last one is removed while the tab is open, fall back to the first usable
  // filter tab so the panel does not linger empty.
  #updateFavoritesVisibility() {
    const hasFavorites = (this.#configuration.favorites ?? []).length > 0;
    if (this.#favoritesNavItem) {
      this.#favoritesNavItem.hidden = !hasFavorites;
    }
    if (!hasFavorites && this.#favoritesTabId === this.#activeTab) {
      const fallback = this.#configuration.tabs.find((tab) => !this.#isTabEmpty(tab)) ?? this.#configuration.tabs[0];
      if (fallback) {
        this.#switchTab(fallback.identifier);
      }
    }
  }

  // A toggle that reveals an inline "name + save" form rather than a native
  // prompt(), matching the modal's own control style. Returns both parts: the
  // toggle joins the header actions row, the form is a separate header line that
  // only unfolds on demand. The label is optional - the server falls back to the
  // phrase itself when it is left empty.
  #buildSaveFavorite() {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pagetree-facets__favorite-add btn btn-sm btn-link d-inline-flex align-items-center gap-1';
    const icon = document.createElement('typo3-backend-icon');
    icon.setAttribute('identifier', 'actions-star');
    icon.setAttribute('size', 'small');
    toggle.append(icon, document.createTextNode(TYPO3.lang?.['pagetreeFacets.modal.saveFavorite'] ?? 'Save current filter'));

    const form = document.createElement('div');
    form.className = 'pagetree-facets__favorite-form';
    form.hidden = true;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm';
    input.placeholder = TYPO3.lang?.['pagetreeFacets.modal.saveFavorite.placeholder'] ?? 'Name this filter';
    input.setAttribute('aria-label', TYPO3.lang?.['pagetreeFacets.modal.saveFavorite.placeholder'] ?? 'Name this filter');

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-sm btn-primary';
    save.textContent = TYPO3.lang?.['pagetreeFacets.modal.saveFavorite.save'] ?? 'Save';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-sm btn-default';
    cancel.textContent = TYPO3.lang?.['pagetreeFacets.modal.saveFavorite.cancel'] ?? 'Cancel';

    const closeForm = () => {
      form.hidden = true;
      toggle.hidden = false;
      input.value = '';
    };
    toggle.addEventListener('click', () => {
      toggle.hidden = true;
      form.hidden = false;
      input.focus();
    });
    cancel.addEventListener('click', closeForm);
    save.addEventListener('click', () => {
      this.#saveFavorite(input.value);
      closeForm();
    });
    input.addEventListener('keydown', (event) => {
      if ('Enter' === event.key) {
        // Stop the modal-wide "Enter applies and closes" handler from firing too.
        event.preventDefault();
        event.stopPropagation();
        this.#saveFavorite(input.value);
        closeForm();
      } else if ('Escape' === event.key) {
        event.preventDefault();
        closeForm();
      }
    });

    form.append(input, save, cancel);
    return { toggle, form };
  }

  async #saveFavorite(label) {
    const tokenString = await this.#computePhrase();
    if ('' === tokenString.trim()) {
      return; // nothing configured to save - the action is hidden in this case anyway
    }
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_favorite_add)
      .post({ label: label.trim(), tokenString });
    this.#configuration.favorites = (await response.resolve()).favorites;
    this.#renderFavoriteChips();
    this.#updateFavoritesVisibility();
    Notification.success(
      TYPO3.lang?.['pagetreeFacets.modal.favoriteSaved.title'] ?? 'Favorite saved',
      TYPO3.lang?.['pagetreeFacets.modal.favoriteSaved.message'] ?? 'The current filter was saved to your favorites.',
    );
  }

  async #removeFavorite(index) {
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_favorite_remove)
      .post({ index });
    this.#configuration.favorites = (await response.resolve()).favorites;
    this.#renderFavoriteChips();
    this.#updateFavoritesVisibility();
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

  #switchTab(identifier) {
    this.#activeTab = identifier;
    // Picking a tab directly always exits search mode - otherwise the results
    // list and the newly-shown panel would be visible at the same time.
    const filterSearch = this.#modal.querySelector('[data-role="filter-search"]');
    if (filterSearch) {
      filterSearch.value = '';
    }
    this.#resultsPanel.hidden = true;
    this.#modal.querySelectorAll('.pagetree-facets__nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === identifier);
    });
    this.#modal.querySelectorAll('.pagetree-facets__panel').forEach((el) => {
      el.hidden = el.dataset.panel !== identifier;
    });
  }

  // Rebuild the active-filter chips and nav dots from the current control state.
  // Called on open and after every change so the header always mirrors reality.
  #refreshActiveIndicators() {
    if (!this.#chips) {
      return;
    }
    const criteria = this.#collectActiveCriteria();
    this.#chips.replaceChildren(...criteria.map((criterion) => this.#renderChip(criterion)));
    this.#active.hidden = criteria.length === 0;
    // The actions (Copy link / Save current filter / Reset) act on the whole
    // phrase, so they follow whether anything is savable - freetext or a scope
    // alone counts, not just tab-criteria chips.
    this.#actions.hidden = !this.#hasSavableFilter();
    // Without a page scope checkbox the utility row would be an empty flex item
    // that still costs the header's row gap, so collapse it with the actions.
    this.#utility.hidden = this.#actions.hidden && !this.#currentPageId;
    // Covers the programmatic paths (reset, chip removal, search-result proxies)
    // that change controls without firing events on the wrapper.
    this.#refreshApplyState();

    const counts = new Map();
    for (const criterion of criteria) {
      counts.set(criterion.tab, (counts.get(criterion.tab) ?? 0) + 1);
    }
    this.#modal.querySelectorAll('.pagetree-facets__nav-item').forEach((item) => {
      // The favorites tab is not a filter criterion, so it never carries a count.
      if (item.dataset.tab === this.#favoritesTabId) {
        return;
      }
      this.#setNavCount(item, counts.get(item.dataset.tab) ?? 0);
    });
  }

  // Clear every criterion in place (all tab controls plus freetext and site)
  // and refresh the header. Stays in the modal - Apply still has to confirm.
  #resetAll() {
    this.#modal.querySelectorAll('.pagetree-facets__body [name]').forEach((input) => {
      if (input.tagName === 'SELECT') {
        Array.from(input.options).forEach((option) => { option.selected = false; });
      } else if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = false;
      } else {
        input.value = '';
        delete input.dataset.value;
        delete input.dataset.label;
      }
    });
    const freetext = this.#modal.querySelector('[data-role="freetext"]');
    if (freetext) {
      freetext.value = '';
    }
    const site = this.#modal.querySelector('[data-role="site-scope"]');
    if (site) {
      site.value = '';
    }
    const pageScope = this.#modal.querySelector('[data-role="page-scope"]');
    if (pageScope) {
      pageScope.checked = false;
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

  // One entry per selected value across all tabs. Each carries a human label and
  // a `remove` closure bound to the concrete control, so deselecting a chip just
  // unsets that control and lets the change listener refresh everything.
  #collectActiveCriteria() {
    const criteria = [];
    for (const tab of this.#configuration.tabs) {
      const fields = this.#distinctFields(tab);
      const nameCounts = this.#fieldNameCounts(tab);
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
        const bucketed = (nameCounts.get(field.name) ?? 0) > 1;
        const prefix = bucketed ? tab.label : (nonBucketedCount > 1 ? field.label : tab.label);
        const inputs = this.#modal.querySelectorAll(`[name="${tab.identifier}[${field.name}]"]`);
        for (const input of inputs) {
          if (input.tagName === 'SELECT') {
            for (const option of input.selectedOptions) {
              criteria.push(this.#criterion(prefix, tab, option.textContent.trim() || option.value, () => { option.selected = false; }));
            }
          } else if (input.type === 'checkbox' || input.type === 'radio') {
            if (input.checked) {
              // Scoped to the dedicated label span, not the whole <label>'s
              // textContent - that would also pick up the visually-hidden
              // option-description span (see #renderOptionHelp).
              const label = input.closest('label')?.querySelector('.pagetree-facets__option-label')?.textContent.trim() || input.value;
              criteria.push(this.#criterion(prefix, tab, label, () => { input.checked = false; }));
            }
          } else if (this.#effectiveValue(input).trim() !== '') {
            const label = input.dataset.label || input.value.trim();
            criteria.push(this.#criterion(prefix, tab, label, () => {
              input.value = '';
              delete input.dataset.value;
              delete input.dataset.label;
            }));
          }
        }
      }
    }
    return criteria;
  }

  #refreshApplyState() {
    if (!this.#applyButton || null === this.#baselineState) {
      return;
    }
    this.#applyButton.disabled = JSON.stringify(this.#collectFormState()) === this.#baselineState;
  }

  // Controls are looked up by name, and a tab may spread one criterion over
  // several fields that share that name - the content element tab does, one
  // field per wizard group. Both collectors must therefore walk distinct names,
  // not fields: per field, the document-wide name lookup returns every matching
  // control, so six same-named fields reported one ticked box six times.
  #distinctFields(tab) {
    const byName = new Map();
    for (const field of tab.configuration.fields ?? []) {
      if (!byName.has(field.name)) {
        byName.set(field.name, field);
      }
    }
    return [...byName.values()];
  }

  // Raw (non-deduplicated) occurrence count per field name - used by
  // #collectActiveCriteria() to tell a bucketed criterion (one name split
  // across several field objects) from one that maps to exactly one field
  // object, which #distinctFields() alone can't distinguish once collapsed.
  #fieldNameCounts(tab) {
    const counts = new Map();
    for (const field of tab.configuration.fields ?? []) {
      counts.set(field.name, (counts.get(field.name) ?? 0) + 1);
    }
    return counts;
  }

  // For dataset.picker controls (currently: user-picker), the visible .value is
  // a display label / in-progress query, not the wire value - dataset.value is
  // the source of truth (absent/empty = no selection yet).
  #effectiveValue(input) {
    return undefined !== input.dataset.picker ? (input.dataset.value ?? '') : input.value;
  }

  #criterion(prefix, tab, valueLabel, remove) {
    return { tab: tab.identifier, label: `${prefix}: ${valueLabel}`, remove };
  }

  #renderChip(criterion) {
    const chip = document.createElement('span');
    chip.className = 'pagetree-facets__chip';
    const text = document.createElement('span');
    text.className = 'pagetree-facets__chip-label';
    text.textContent = criterion.label;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pagetree-facets__chip-remove';
    remove.setAttribute('aria-label', `${criterion.label} – ${TYPO3.lang?.['pagetreeFacets.modal.removeFilter'] ?? 'remove filter'}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      criterion.remove();
      this.#refreshActiveIndicators();
    });
    chip.append(text, remove);
    return chip;
  }

  async #serializeAndApply() {
    this.#apply(await this.#computePhrase());
  }

  // Same serialization Apply uses, factored out so "copy link" can share it -
  // both need the canonical phrase for whatever is currently configured in
  // the modal, not just what has already been applied to the tree.
  async #computePhrase() {
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
      for (const field of this.#distinctFields(tab)) {
        const inputs = this.#modal.querySelectorAll(`[name="${tab.identifier}[${field.name}]"]`);
        const values = [];
        for (const input of inputs) {
          if (input.tagName === 'SELECT') {
            values.push(...Array.from(input.selectedOptions).map((o) => o.value));
          } else if (input.type === 'checkbox' || input.type === 'radio') {
            if (input.checked) {
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
    const site = this.#modal.querySelector('[data-role="site-scope"]')?.value ?? '';
    const freetext = this.#modal.querySelector('[data-role="freetext"]')?.value ?? '';
    // Always the page open right now, not whatever page a previously-hydrated
    // "under:" token pointed at - re-checking the box always means "here",
    // same mental model as ticking it fresh.
    const pageScopeCheckbox = this.#modal.querySelector('[data-role="page-scope"]');
    const pageScope = pageScopeCheckbox?.checked ? this.#currentPageId : 0;

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

  #apply(phrase) {
    this.#modal?.hideModal();
    this.#onApply?.(phrase);
  }
}

export default new FacetsModal();
