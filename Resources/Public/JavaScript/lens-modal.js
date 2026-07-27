/**
 * This file is part of the "pagetree_lens" TYPO3 CMS extension.
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
class LensModal {
  #modal = null;
  #configuration = null;
  #activeTab = null;
  #onApply = null;

  async open(currentPhrase, onApply) {
    this.#onApply = onApply;
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.pagetree_lens_configuration)
      .withQueryArguments({ phrase: currentPhrase })
      .get();
    this.#configuration = await response.resolve();
    if (!this.#configuration.tabs.length) {
      return;
    }
    this.#activeTab = this.#configuration.tabs[0].identifier;

    this.#modal = Modal.advanced({
      title: TYPO3.lang?.['pagetreeLens.modal.title'] ?? 'Filter page tree',
      size: Modal.sizes.large,
      content: this.#render(),
      buttons: [
        {
          text: TYPO3.lang?.['pagetreeLens.modal.reset'] ?? 'Reset',
          btnClass: 'btn-default',
          trigger: () => { this.#apply(''); },
        },
        {
          text: TYPO3.lang?.['pagetreeLens.modal.apply'] ?? 'Apply',
          btnClass: 'btn-primary',
          trigger: () => { this.#serializeAndApply(); },
        },
      ],
    });
    this.#modal.addEventListener('typo3-modal-shown', () => {
      this.#modal.querySelector('.pagetree-lens')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
          event.preventDefault();
          this.#serializeAndApply();
        }
      });
    });
  }

  #render() {
    const wrap = document.createElement('div');
    wrap.className = 'pagetree-lens row';
    wrap.append(this.#renderNavigation(), this.#renderPanels(), this.#renderFooter());
    return wrap;
  }

  #renderNavigation() {
    const nav = document.createElement('div');
    nav.className = 'col-3 pagetree-lens__nav';
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
        heading.className = 'pagetree-lens__nav-group text-muted text-uppercase';
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
    button.className = 'pagetree-lens__nav-item' + (tab.identifier === this.#activeTab ? ' active' : '');
    button.dataset.tab = tab.identifier;
    button.textContent = tab.label;
    if (Object.keys(tab.state ?? {}).length) {
      const dot = document.createElement('span');
      dot.className = 'pagetree-lens__nav-dot';
      dot.textContent = '\u25CF';
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot);
    }
    button.addEventListener('click', () => this.#switchTab(tab.identifier));
    item.append(button);
    return item;
  }

  #renderPanels() {
    const panels = document.createElement('div');
    panels.className = 'col-9 pagetree-lens__panels';
    panels.append(this.#renderFreetext());
    if ((this.#configuration.sites ?? []).length > 1) {
      panels.append(this.#renderSiteScope());
    }
    for (const tab of this.#configuration.tabs) {
      panels.append(this.#renderPanel(tab));
    }
    return panels;
  }

  #renderFreetext() {
    // Freetext must survive the modal round trip - it is a first-class
    // criterion (intersected engine-side), not decoration.
    const row = document.createElement('div');
    row.className = 'form-group pagetree-lens__freetext';
    const input = document.createElement('input');
    input.className = 'form-control';
    input.type = 'text';
    input.dataset.role = 'freetext';
    const freetextLabel = TYPO3.lang?.['pagetreeLens.modal.freetext'] ?? 'Page title or UID';
    input.placeholder = freetextLabel;
    input.setAttribute('aria-label', freetextLabel);
    input.value = this.#configuration.freetext ?? '';
    row.append(input);
    return row;
  }

  #renderSiteScope() {
    const row = document.createElement('div');
    row.className = 'form-group pagetree-lens__site';
    const select = document.createElement('select');
    select.className = 'form-select';
    select.dataset.role = 'site-scope';
    select.setAttribute('aria-label', TYPO3.lang?.['pagetreeLens.modal.allSites'] ?? 'All sites');
    select.append(new Option(TYPO3.lang?.['pagetreeLens.modal.allSites'] ?? 'All sites', ''));
    for (const site of this.#configuration.sites) {
      const option = new Option(site.identifier, site.identifier, false, site.identifier === this.#configuration.activeSite);
      select.append(option);
    }
    row.append(select);
    return row;
  }

  #renderPanel(tab) {
    const panel = document.createElement('div');
    panel.className = 'pagetree-lens__panel';
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
    legend.className = 'form-label h6';
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
    footer.className = 'col-12 pagetree-lens__favorites mt-3';
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
    this.#modal.querySelectorAll('.pagetree-lens__nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === identifier);
    });
    this.#modal.querySelectorAll('.pagetree-lens__panel').forEach((el) => {
      el.hidden = el.dataset.panel !== identifier;
    });
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
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.pagetree_lens_serialize)
      .post({ states, site, freetext });
    const { phrase } = await response.resolve();
    this.#apply(phrase);
  }

  #apply(phrase) {
    this.#modal?.hideModal();
    this.#onApply?.(phrase);
  }
}

export default new LensModal();
