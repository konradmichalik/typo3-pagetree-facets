import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildScopeMenu } from '@konradmichalik/pagetree-facets/Filter/scope-menu.js';

/*
 * The scope chip and its list: one choice between the whole tree, the page open
 * right now and (with more than one site) each site. The modal reads `value`
 * for the serialize payload and never touches the list itself.
 */

const sites = [{ identifier: 'main', rootPageId: 1 }, { identifier: 'other', rootPageId: 20 }];
const currentPage = { uid: 5, title: 'Home' };

const mount = (options = {}) => {
  const onChange = vi.fn();
  const menu = buildScopeMenu({
    sites, activeSite: '', pageScope: null, currentPage, onChange, ...options,
  });
  if (menu) {
    document.body.replaceChildren(menu.element);
  }

  return { menu, onChange };
};

const chip = (menu) => menu.element.querySelector('.pagetree-facets__scope-chip');
const list = (menu) => menu.element.querySelector('[role="listbox"]');
const options = (menu) => [...list(menu).querySelectorAll('[role="option"]')];
const labels = (menu) => options(menu).map((option) => option.textContent.trim());
const key = (target, name) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);

  return event;
};

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
  document.body.replaceChildren();
});

describe('rendering', () => {
  it('is not rendered without an open page and with a single site', () => {
    expect(buildScopeMenu({ sites: [sites[0]], activeSite: '', pageScope: null, currentPage: null, onChange: vi.fn() })).toBeNull();
    expect(buildScopeMenu({ sites: undefined, activeSite: '', pageScope: null, currentPage: null, onChange: vi.fn() })).toBeNull();
  });

  it('lists the whole tree, the open page and every site, in that order', () => {
    const { menu } = mount();

    expect(labels(menu)).toEqual(['Whole tree', 'Below "Home" [5]', 'main', 'other']);
  });

  it('leaves the page entry out without an open page, and the sites out with only one', () => {
    expect(labels(mount({ currentPage: null }).menu)).toEqual(['Whole tree', 'main', 'other']);
    expect(labels(mount({ sites: [sites[0]] }).menu)).toEqual(['Whole tree', 'Below "Home" [5]']);
  });

  it('names the page by its uid alone when the tree gave no title', () => {
    const { menu } = mount({ currentPage: { uid: 5, title: '' } });

    expect(labels(menu)[1]).toBe('Below page [5]');
  });

  it('reads as a button opening a listbox, with a dashed look that is not a removable chip', () => {
    const { menu } = mount();

    expect(chip(menu).type).toBe('button');
    expect(chip(menu).getAttribute('aria-haspopup')).toBe('listbox');
    expect(chip(menu).getAttribute('aria-expanded')).toBe('false');
    expect(chip(menu).getAttribute('aria-controls')).toBe(list(menu).id);
    expect(chip(menu).querySelector('typo3-backend-icon').getAttribute('identifier')).toBe('actions-chevron-down');
    expect(chip(menu).textContent.replace(/\s+/g, ' ').trim()).toBe('In: Whole tree');
    expect(menu.element.querySelector('.pagetree-facets__chip-remove')).toBeNull();
  });

  it('starts on the whole tree with an empty value', () => {
    const { menu } = mount();

    expect(menu.value).toEqual({ site: '', pageScope: 0 });
    expect(options(menu)[0].getAttribute('aria-selected')).toBe('true');
  });
});

describe('hydration', () => {
  it('shows the site the phrase already scopes to', () => {
    const { menu } = mount({ activeSite: 'other' });

    expect(chip(menu).textContent).toContain('other');
    expect(menu.value).toEqual({ site: 'other', pageScope: 0 });
    expect(options(menu)[3].getAttribute('aria-selected')).toBe('true');
  });

  it('shows the open page when the phrase carries an under: token, always as the page open now', () => {
    // under:7 hydrated while page 5 is open: re-selecting "below" means "here".
    const { menu } = mount({ pageScope: 7 });

    expect(chip(menu).textContent).toContain('Below "Home" [5]');
    expect(menu.value).toEqual({ site: '', pageScope: 5 });
  });

  it('drops a page scope when no page is open to stand for it', () => {
    const { menu } = mount({ pageScope: 7, currentPage: null });

    expect(menu.value).toEqual({ site: '', pageScope: 0 });
  });

  it('keeps a hydrated site alongside the page scope until another entry is picked', () => {
    // The list is single-select, but a phrase may carry both; neither is lost on
    // a round trip the user did not touch.
    const { menu } = mount({ activeSite: 'main', pageScope: 5 });

    expect(menu.value).toEqual({ site: 'main', pageScope: 5 });
    expect(chip(menu).textContent).toContain('Below "Home" [5]');
  });

  it('names a hydrated site that is not in the list, selecting no entry', () => {
    // A phrase may scope to a site outside the user's mounts; the chip still
    // says so rather than claiming the whole tree.
    const { menu } = mount({ activeSite: 'elsewhere' });

    expect(chip(menu).textContent).toContain('elsewhere');
    expect(menu.value).toEqual({ site: 'elsewhere', pageScope: 0 });
    expect(options(menu).every((option) => 'false' === option.getAttribute('aria-selected'))).toBe(true);
  });

  it('re-hydrates from a new configuration without reporting a change', () => {
    const { menu, onChange } = mount();

    menu.hydrate({ activeSite: 'main', pageScope: null });

    expect(menu.value).toEqual({ site: 'main', pageScope: 0 });
    expect(chip(menu).textContent).toContain('main');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('resets to the whole tree without reporting a change', () => {
    const { menu, onChange } = mount({ activeSite: 'main', pageScope: 5 });

    menu.reset();

    expect(menu.value).toEqual({ site: '', pageScope: 0 });
    expect(chip(menu).textContent).toContain('Whole tree');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('picking with the pointer', () => {
  it('opens the list on the chip and focuses it with the current entry active', () => {
    const { menu } = mount({ activeSite: 'main' });

    chip(menu).click();

    expect(list(menu).hidden).toBe(false);
    expect(document.activeElement).toBe(list(menu));
    expect(list(menu).getAttribute('aria-activedescendant')).toBe(options(menu)[2].id);
  });

  it('selects a clicked entry, closes, returns focus and reports the change', () => {
    const { menu, onChange } = mount();
    chip(menu).click();

    options(menu)[1].click();

    expect(menu.value).toEqual({ site: '', pageScope: 5 });
    expect(chip(menu).textContent).toContain('Below "Home" [5]');
    expect(list(menu).hidden).toBe(true);
    expect(document.activeElement).toBe(chip(menu));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(options(menu)[1].getAttribute('aria-selected')).toBe('true');
    expect(options(menu)[0].getAttribute('aria-selected')).toBe('false');
  });

  it('picking a site clears the page scope, and the other way round', () => {
    const { menu } = mount({ activeSite: 'main', pageScope: 5 });
    chip(menu).click();
    options(menu)[2].click();
    expect(menu.value).toEqual({ site: 'main', pageScope: 0 });

    chip(menu).click();
    options(menu)[1].click();
    expect(menu.value).toEqual({ site: '', pageScope: 5 });
  });
});

describe('picking with the keyboard', () => {
  it('moves the active entry with the arrows, wrapping, and jumps with Home and End', () => {
    const { menu } = mount();
    chip(menu).click();
    const active = () => options(menu).findIndex((option) => option.id === list(menu).getAttribute('aria-activedescendant'));

    expect(key(list(menu), 'ArrowDown').defaultPrevented).toBe(true);
    expect(active()).toBe(1);
    key(list(menu), 'ArrowUp');
    key(list(menu), 'ArrowUp');
    expect(active()).toBe(3);
    key(list(menu), 'Home');
    expect(active()).toBe(0);
    key(list(menu), 'End');
    expect(active()).toBe(3);
  });

  it('selects the active entry with Enter or Space, keeping Enter from applying the modal', () => {
    const { menu, onChange } = mount();
    chip(menu).click();
    key(list(menu), 'ArrowDown');
    const reachedModal = vi.fn();
    document.body.addEventListener('keydown', reachedModal);

    const enter = key(list(menu), 'Enter');

    expect(enter.defaultPrevented).toBe(true);
    expect(reachedModal).not.toHaveBeenCalled();
    expect(menu.value).toEqual({ site: '', pageScope: 5 });
    expect(list(menu).hidden).toBe(true);
    expect(document.activeElement).toBe(chip(menu));

    chip(menu).click();
    key(list(menu), 'End');
    key(list(menu), ' ');
    expect(menu.value).toEqual({ site: 'other', pageScope: 0 });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('opens the list from the chip with ArrowDown, and with that key only', () => {
    const { menu } = mount();

    expect(key(chip(menu), 'ArrowUp').defaultPrevented).toBe(false);
    expect(list(menu).hidden).toBe(true);

    const event = key(chip(menu), 'ArrowDown');

    expect(event.defaultPrevented).toBe(true);
    expect(list(menu).hidden).toBe(false);
    expect(document.activeElement).toBe(list(menu));
  });

  it('closes on Escape without changing the value', () => {
    const { menu, onChange } = mount();
    chip(menu).click();
    key(list(menu), 'ArrowDown');

    key(list(menu), 'Escape');

    expect(list(menu).hidden).toBe(true);
    expect(menu.value).toEqual({ site: '', pageScope: 0 });
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(chip(menu));
  });

  it('leaves other keys to the browser', () => {
    const { menu } = mount();
    chip(menu).click();

    expect(key(list(menu), 'Tab').defaultPrevented).toBe(false);
  });

  it('closes on a pointer press outside', () => {
    const { menu } = mount();
    chip(menu).click();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(list(menu).hidden).toBe(true);
  });

  it('can be closed by the modal on teardown', () => {
    const { menu } = mount();
    chip(menu).click();

    menu.close();

    expect(list(menu).hidden).toBe(true);
  });
});
