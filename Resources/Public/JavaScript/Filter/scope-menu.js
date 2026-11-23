/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { decorativeIcon, lang, uniqueId } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { attachPopover } from '@konradmichalik/pagetree-facets/Filter/popover.js';

/**
 * The scope chip `In: Whole tree` and its list: the whole tree, the open page,
 * and each site when there is more than one. A dashed button rather than a
 * removable chip, because a scope is never a criterion that could be taken away.
 * Listbox pattern (WAI-ARIA APG): the list takes focus, aria-activedescendant
 * marks the entry the arrows moved to, Enter or Space picks it.
 */

/**
 * @param {{sites?: Array<{identifier: string}>, activeSite: string|null, pageScope: number|null,
 *   currentPage: {uid: number, title: string}|null, onChange: () => void}} options
 * @returns {{element: HTMLElement, value: {site: string, pageScope: number},
 *   hydrate: (configuration: {activeSite?: string|null, pageScope?: number|null}) => void,
 *   reset: () => void, close: () => void, focus: () => void}|null} null when there is nothing to choose
 */
export function buildScopeMenu({ sites = [], activeSite, pageScope, currentPage, onChange }) {
  if (!currentPage && sites.length < 2) {
    return null;
  }

  return new ScopeMenu({ sites, currentPage, onChange }).hydrate({ activeSite, pageScope });
}

class ScopeMenu {
  #entries;
  #currentPage;
  #onChange;
  // Kept apart although the list is single-select: a hydrated phrase may carry
  // both, and neither is dropped until the user picks another entry.
  #site = '';
  #below = false;
  #active = 0;
  #chip;
  #chipValue;
  #list;
  #popover;
  element;

  constructor({ sites, currentPage, onChange }) {
    this.#currentPage = currentPage;
    this.#onChange = onChange;
    this.#entries = buildEntries(sites, currentPage);

    this.#list = this.#buildList();
    this.#chip = this.#buildChip();
    this.#popover = attachPopover({
      trigger: this.#chip,
      panel: this.#list,
      onOpen: () => {
        this.#setActive(this.#selectedIndex());
        this.#list.focus();
      },
    });

    this.element = document.createElement('div');
    this.element.className = 'pagetree-facets__scope';
    this.element.append(this.#chip, this.#list);
  }

  get value() {
    return { site: this.#site, pageScope: this.#below ? this.#currentPage.uid : 0 };
  }

  hydrate({ activeSite, pageScope }) {
    this.#site = activeSite ?? '';
    this.#below = null !== (pageScope ?? null) && null !== this.#currentPage;
    this.#render();

    return this;
  }

  reset() {
    this.hydrate({ activeSite: '', pageScope: null });
  }

  close() {
    this.#popover.close();
  }

  focus() {
    this.#chip.focus();
  }

  #buildChip() {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pagetree-facets__scope-chip';
    chip.setAttribute('aria-haspopup', 'listbox');
    chip.setAttribute('aria-controls', this.#list.id);
    const prefix = document.createElement('span');
    prefix.className = 'pagetree-facets__chip-prefix';
    prefix.textContent = `${lang('pagetreeFacets.modal.scope', 'In')}:`;
    this.#chipValue = document.createElement('span');
    this.#chipValue.className = 'pagetree-facets__scope-value';
    chip.append(prefix, document.createTextNode(' '), this.#chipValue, decorativeIcon('actions-chevron-down'));
    chip.addEventListener('keydown', (event) => {
      if ('ArrowDown' === event.key) {
        event.preventDefault();
        this.#popover.show();
      }
    });

    return chip;
  }

  #buildList() {
    const list = document.createElement('ul');
    list.id = uniqueId('pagetree-facets__scope-list');
    list.className = 'pagetree-facets__scope-list list-unstyled';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', lang('pagetreeFacets.modal.scope.description', 'Where to look for pages'));
    list.tabIndex = -1;
    list.hidden = true;
    this.#entries.forEach((entry, index) => {
      const option = document.createElement('li');
      option.id = `${list.id}-${index}`;
      option.className = 'pagetree-facets__scope-option';
      option.setAttribute('role', 'option');
      option.textContent = entry.label;
      option.addEventListener('click', () => this.#pick(index));
      list.append(option);
    });
    list.addEventListener('keydown', (event) => this.#onListKeydown(event));

    return list;
  }

  #onListKeydown(event) {
    const last = this.#entries.length - 1;
    const moves = {
      ArrowDown: this.#active + 1 > last ? 0 : this.#active + 1,
      ArrowUp: this.#active - 1 < 0 ? last : this.#active - 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      this.#setActive(moves[event.key]);
    } else if ('Enter' === event.key || ' ' === event.key) {
      // Also keeps Enter from the modal-wide "Enter applies" handler.
      event.preventDefault();
      event.stopPropagation();
      this.#pick(this.#active);
    }
  }

  #pick(index) {
    const entry = this.#entries[index];
    this.#site = entry.site;
    this.#below = entry.below;
    this.#render();
    this.#popover.close(true);
    this.#onChange();
  }

  #setActive(index) {
    this.#active = index;
    this.#list.setAttribute('aria-activedescendant', this.#list.children[index].id);
    [...this.#list.children].forEach((option, i) => option.classList.toggle('is-active', i === index));
  }

  // The page scope is the more specific of the two, so it names the chip when
  // a hydrated phrase carries both.
  #selectedIndex() {
    const index = this.#entries.findIndex((entry) => (this.#below ? entry.below : !entry.below && entry.site === this.#site));

    return -1 === index ? 0 : index;
  }

  #render() {
    const selected = this.#selectedIndex();
    // A hydrated site outside the user's mounts has no entry; the chip still
    // names it, so the phrase it came from is not silently misdescribed.
    const unlisted = !this.#below && '' !== this.#site && 0 === selected;
    this.#chipValue.textContent = unlisted ? this.#site : this.#entries[selected].label;
    [...this.#list.children].forEach((option, index) => {
      option.setAttribute('aria-selected', String(!unlisted && index === selected));
    });
  }
}

function buildEntries(sites, currentPage) {
  const entries = [{ label: lang('pagetreeFacets.modal.scope.wholeTree', 'Whole tree'), site: '', below: false }];
  if (currentPage) {
    const template = '' === currentPage.title
      ? lang('pagetreeFacets.modal.scope.belowPage', 'Below page [%d]')
      : lang('pagetreeFacets.modal.scope.below', 'Below "%s" [%d]');
    const values = { '%s': currentPage.title, '%d': String(currentPage.uid) };
    // One pass with a function replacer: a title holding `%d` or `$&` stays as typed.
    entries.push({ label: template.replace(/%[sd]/g, (match) => values[match]), site: '', below: true });
  }
  if (sites.length > 1) {
    entries.push(...sites.map((site) => ({ label: site.identifier, site: site.identifier, below: false })));
  }

  return entries;
}
