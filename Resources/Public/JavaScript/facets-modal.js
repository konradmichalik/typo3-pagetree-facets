/**
 * This file is part of the "pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Modal from '@typo3/backend/modal.js';
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

  async open(currentPhrase, onApply) {
    this.#onApply = onApply;
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.pagetree_facets_configuration)
      .withQueryArguments({ phrase: currentPhrase })
      .get();
    this.#configuration = await response.resolve();
    if (!this.#configuration.tabs.length) {
      return;
    }
    this.#activeTab = this.#configuration.tabs[0].identifier;

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
          trigger: () => { this.#serializeAndApply(); },
        },
      ],
    });
    this.#modal.addEventListener('typo3-modal-shown', () => {
      const root = this.#modal.querySelector('.pagetree-facets');
      root?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
          event.preventDefault();
          this.#serializeAndApply();
        }
      });
      // Populate the active-filter chips from the hydrated state once the modal
      // is in the DOM (the chip list is derived from the live form controls).
      this.#refreshActiveIndicators();
    });
  }

  #render() {
    const wrap = document.createElement('div');
    wrap.className = 'pagetree-facets';
    wrap.append(this.#renderHeader(), this.#renderBody(), this.#renderFooter());
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
    header.append(search);

    // Active-filter row: the removable chips plus a one-click reset that clears
    // every criterion. Hidden entirely while nothing is active.
    this.#active = document.createElement('div');
    this.#active.className = 'pagetree-facets__active';
    this.#active.hidden = true;

    this.#chips = document.createElement('div');
    this.#chips.className = 'pagetree-facets__chips';
    this.#active.append(this.#chips);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'pagetree-facets__reset btn btn-sm btn-link';
    reset.textContent = TYPO3.lang?.['pagetreeFacets.modal.reset'] ?? 'Reset';
    reset.addEventListener('click', () => this.#resetAll());
    this.#active.append(reset);

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
    const list = document.createElement('ul');
    list.className = 'list-unstyled';

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
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pagetree-facets__nav-item' + (tab.identifier === this.#activeTab ? ' active' : '');
    button.dataset.tab = tab.identifier;
    // Label text kept in its own node so the active-criteria dot can be toggled
    // live (see #setNavDot) without clobbering the label.
    const text = document.createElement('span');
    text.textContent = tab.label;
    button.append(text);
    button.addEventListener('click', () => this.#switchTab(tab.identifier));
    item.append(button);
    return item;
  }

  #renderPanels() {
    const panels = document.createElement('div');
    panels.className = 'col-9 pagetree-facets__panels';
    for (const tab of this.#configuration.tabs) {
      panels.append(this.#renderPanel(tab));
    }
    return panels;
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
    row.append(input);
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

    if (field.type === 'checkbox-group' || field.type === 'radio-presets') {
      const isRadio = field.type === 'radio-presets';
      for (const option of field.options ?? []) {
        const label = document.createElement('label');
        label.className = 'form-check d-flex align-items-center gap-1';
        const input = document.createElement('input');
        input.className = 'form-check-input';
        input.type = isRadio ? 'radio' : 'checkbox';
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
        label.append(document.createTextNode(' ' + option.label));
        group.append(label);
      }
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
    group.append(input);
    return group;
  }

  #renderFooter() {
    const footer = document.createElement('div');
    footer.className = 'pagetree-facets__favorites';
    for (const [index, favorite] of (this.#configuration.favorites ?? []).entries()) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'btn btn-sm btn-default me-1';
      chip.textContent = favorite.label;
      chip.title = favorite.tokenString;
      chip.addEventListener('click', () => this.#apply(favorite.tokenString));
      footer.append(chip);
    }
    return footer;
  }

  #switchTab(identifier) {
    this.#activeTab = identifier;
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

    const counts = new Map();
    for (const criterion of criteria) {
      counts.set(criterion.tab, (counts.get(criterion.tab) ?? 0) + 1);
    }
    this.#modal.querySelectorAll('.pagetree-facets__nav-item').forEach((item) => {
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
      for (const field of tab.configuration.fields ?? []) {
        const inputs = this.#modal.querySelectorAll(`[name="${tab.identifier}[${field.name}]"]`);
        for (const input of inputs) {
          if (input.tagName === 'SELECT') {
            for (const option of input.selectedOptions) {
              criteria.push(this.#criterion(tab, option.textContent.trim() || option.value, () => { option.selected = false; }));
            }
          } else if (input.type === 'checkbox' || input.type === 'radio') {
            if (input.checked) {
              const label = input.closest('label')?.textContent.trim() || input.value;
              criteria.push(this.#criterion(tab, label, () => { input.checked = false; }));
            }
          } else if (input.value.trim() !== '') {
            criteria.push(this.#criterion(tab, input.value.trim(), () => { input.value = ''; }));
          }
        }
      }
    }
    return criteria;
  }

  #criterion(tab, valueLabel, remove) {
    return { tab: tab.identifier, label: `${tab.label}: ${valueLabel}`, remove };
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
    const states = {};
    for (const tab of this.#configuration.tabs) {
      const state = {};
      for (const field of tab.configuration.fields ?? []) {
        const inputs = this.#modal.querySelectorAll(`[name="${tab.identifier}[${field.name}]"]`);
        const values = [];
        for (const input of inputs) {
          if (input.tagName === 'SELECT') {
            values.push(...Array.from(input.selectedOptions).map((o) => o.value));
          } else if ((input.type === 'checkbox' || input.type === 'radio') ? input.checked : input.value !== '') {
            values.push(input.value);
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
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.pagetree_facets_serialize)
      .post({ states, site, freetext });
    const { phrase } = await response.resolve();
    this.#apply(phrase);
  }

  #apply(phrase) {
    this.#modal?.hideModal();
    this.#onApply?.(phrase);
  }
}

export default new FacetsModal();
