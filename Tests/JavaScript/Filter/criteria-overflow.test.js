import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCriteriaRow } from '@konradmichalik/pagetree-facets/Filter/criteria-row.js';

/*
 * The `+N more` overflow of the criteria row (see Filter/criteria-overflow.js).
 * jsdom has no layout, so the measuring is injected: `perRow(n)` stands for a
 * row that fits n items per line, and `observe` hands back the resize callback.
 */

const perRow = (n) => (elements) => elements.map((_, index) => Math.floor(index / n));

const criterion = (prefix, value) => ({ prefix, value, label: `${prefix}: ${value}` });
const eight = [
  criterion('Page type', 'Standard'), criterion('Page type', 'Link'), criterion('Page type', 'Folder'),
  criterion('Page state', 'Hidden'), criterion('Page state', 'Empty'),
  criterion('Content element', 'Text'), criterion('Content element', 'Sitemap'), criterion('Content element', 'News'),
];

function mount(options = {}) {
  const handlers = {
    onRemove: vi.fn(), onClearAll: vi.fn(), onSaveFavorite: vi.fn(), onCopyLink: vi.fn(), focusFallback: vi.fn(),
  };
  let resize = () => {};
  const row = buildCriteriaRow({
    scope: null,
    ...handlers,
    measure: perRow(3),
    observe: (_, callback) => { resize = callback; },
    ...options,
  });
  document.body.replaceChildren(row.element);

  return { row, ...handlers, resize: () => resize() };
}

const chips = (row) => [...row.element.querySelectorAll('.pagetree-facets__chips > .pagetree-facets__chip')];
const visibleChips = (row) => chips(row).filter((chip) => !chip.hidden);
const moreButton = (row) => row.element.querySelector('.pagetree-facets__overflow-button');
const popover = (row) => row.element.querySelector('.pagetree-facets__overflow-panel');
const entries = (row) => [...popover(row).querySelectorAll('.pagetree-facets__chip-remove')];

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('the +N more overflow', () => {
  it('shows every chip while they fit in two rows', () => {
    const { row } = mount({ measure: perRow(10) });

    row.update({ criteria: eight, savable: true });

    expect(visibleChips(row)).toHaveLength(8);
    expect(moreButton(row).closest('.pagetree-facets__overflow').hidden).toBe(true);
  });

  it('collects the chips past the second row behind +N more, leaving room for the button and the actions', () => {
    const { row } = mount();

    row.update({ criteria: eight, savable: true });

    // Six chips fill two rows of three, but the button and the actions need a
    // place on the second row too, so two more chips give way.
    expect(visibleChips(row).map((chip) => chip.querySelector('.pagetree-facets__chip-value').textContent))
      .toEqual(['Standard', 'Link', 'Folder', 'Hidden']);
    expect(chips(row).filter((chip) => chip.hidden)).toHaveLength(4);
    expect(moreButton(row).closest('.pagetree-facets__overflow').hidden).toBe(false);
    expect(moreButton(row).textContent).toBe('+4 more');
    expect(moreButton(row).getAttribute('aria-label')).toBe('Show 4 more criteria');
    expect(moreButton(row).getAttribute('aria-haspopup')).toBe('dialog');
    expect(moreButton(row).getAttribute('aria-expanded')).toBe('false');
  });

  it('never cuts a chip: the measured fit decides, nothing is clipped', () => {
    const { row } = mount();
    row.update({ criteria: eight, savable: true });

    for (const chip of chips(row)) {
      expect(chip.style.overflow).toBe('');
    }
  });

  it('re-measures when the row is resized and hands a hidden chip\'s focus to the button', () => {
    const measure = vi.fn(perRow(3));
    const { row, resize } = mount({ measure });
    row.update({ criteria: eight, savable: true });
    visibleChips(row)[3].querySelector('.pagetree-facets__chip-remove').focus();

    measure.mockImplementation(perRow(2));
    resize();

    expect(visibleChips(row)).toHaveLength(2);
    expect(moreButton(row).textContent).toBe('+6 more');
    expect(document.activeElement).toBe(moreButton(row));
  });

  it('hands focus to the button when the chip that took a removed one\'s place is hidden', () => {
    const measure = vi.fn(perRow(3));
    const { row } = mount({ measure });
    row.update({ criteria: eight, savable: true });
    visibleChips(row)[3].querySelector('.pagetree-facets__chip-remove').focus();

    // The row got narrower in between, so the rebuilt row keeps fewer chips.
    measure.mockImplementation(perRow(2));
    row.update({ criteria: eight.slice(1), savable: true });

    expect(visibleChips(row)).toHaveLength(2);
    expect(document.activeElement).toBe(moreButton(row));
  });

  it('never shows a +0 more button while it looks for the chips that fit beside the actions', () => {
    const seen = [];
    let row;
    // Six chips fill both rows at three per line, so only the actions are left over.
    ({ row } = mount({
      measure: (elements) => {
        seen.push(moreButton(row)?.textContent);

        return perRow(3)(elements);
      },
    }));

    row.update({ criteria: eight.slice(0, 6), savable: true });

    expect(seen.filter((text) => text?.startsWith('+0'))).toEqual([]);
    // Four chips, the button and the actions are what two rows of three hold.
    expect(moreButton(row).textContent).toBe('+2 more');
  });

  it('keeps focus on the open dialog when a resize re-measures the row', () => {
    const { row, resize } = mount();
    row.update({ criteria: eight, savable: true });
    moreButton(row).click();
    expect(document.activeElement).toBe(popover(row));

    resize();

    expect(document.activeElement).toBe(popover(row));
  });

  it('opens a named dialog listing every criterion grouped by facet, each removable, plus Clear all', () => {
    const { row, onRemove, onClearAll } = mount();
    row.update({ criteria: eight, savable: true });

    moreButton(row).click();

    expect(popover(row).hidden).toBe(false);
    expect(popover(row).getAttribute('role')).toBe('dialog');
    expect(moreButton(row).getAttribute('aria-controls')).toBe(popover(row).id);
    expect(document.activeElement).toBe(popover(row));
    const title = popover(row).querySelector('.pagetree-facets__overflow-title');
    expect(title.textContent).toBe('All 8 criteria');
    expect(popover(row).getAttribute('aria-labelledby')).toBe(title.id);
    expect([...popover(row).querySelectorAll('dt')].map((group) => group.textContent))
      .toEqual(['Page type', 'Page state', 'Content element']);
    expect(entries(row).map((remove) => remove.getAttribute('aria-label'))).toEqual(eight.map((c) => `Remove ${c.label}`));
    // The facet is the row label, so the chip shows the value alone and carries
    // no second title under the ×.
    const chip = popover(row).querySelector('.pagetree-facets__chip');
    expect(chip.querySelector('.pagetree-facets__chip-prefix')).toBeNull();
    expect(chip.title).toBe('');
    expect(chip.textContent).toContain('Standard');

    entries(row)[4].click();
    expect(onRemove).toHaveBeenCalledWith(eight[4]);

    popover(row).querySelector('.pagetree-facets__overflow-clear').click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on the entry that took the removed one\'s place', () => {
    const { row } = mount();
    row.update({ criteria: eight, savable: true });
    moreButton(row).click();
    entries(row)[4].focus();

    row.update({ criteria: eight.filter((_, index) => 4 !== index), savable: true });

    expect(popover(row).hidden).toBe(false);
    expect(document.activeElement).toBe(entries(row)[4]);
    expect(document.activeElement.getAttribute('aria-label')).toBe('Remove Content element: Text');
  });

  it('falls back to the last entry, then to the button, as the list shrinks under the focus', () => {
    const { row } = mount();
    row.update({ criteria: eight, savable: true });
    moreButton(row).click();
    entries(row)[7].focus();

    row.update({ criteria: eight.slice(0, 7), savable: true });

    expect(document.activeElement).toBe(entries(row)[6]);
  });

  it('closes the popover once nothing is hidden any more and moves focus to the last chip', () => {
    const { row } = mount();
    row.update({ criteria: eight, savable: true });
    moreButton(row).click();
    entries(row)[7].focus();

    row.update({ criteria: eight.slice(0, 3), savable: true });

    expect(popover(row).hidden).toBe(true);
    expect(moreButton(row).closest('.pagetree-facets__overflow').hidden).toBe(true);
    expect(document.activeElement).toBe(visibleChips(row)[2].querySelector('.pagetree-facets__chip-remove'));
  });

  it('hands focus on when Clear all in the popover empties the row', () => {
    const { row, focusFallback } = mount();
    row.update({ criteria: eight, savable: true });
    moreButton(row).click();
    popover(row).querySelector('.pagetree-facets__overflow-clear').focus();

    row.update({ criteria: [], savable: false });

    expect(popover(row).hidden).toBe(true);
    expect(focusFallback).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape with focus back on the button, and can be closed by the row', () => {
    const { row } = mount();
    row.update({ criteria: eight, savable: true });
    moreButton(row).click();

    popover(row).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(popover(row).hidden).toBe(true);
    expect(document.activeElement).toBe(moreButton(row));

    moreButton(row).click();
    row.close();
    expect(popover(row).hidden).toBe(true);
  });

  it('watches the row with a ResizeObserver and reads rows off the layout by default', () => {
    const observed = [];
    globalThis.ResizeObserver = class {
      constructor(callback) { this.callback = callback; }
      observe(element) { observed.push({ element, trigger: this.callback }); }
    };
    const { row } = mount({ measure: undefined, observe: undefined });

    row.update({ criteria: eight, savable: true });
    observed[0].trigger();

    expect(observed[0].element).toBe(row.element.querySelector('.pagetree-facets__criteria'));
    // jsdom lays nothing out, so every item sits on one row and all of them fit.
    expect(visibleChips(row)).toHaveLength(8);
    delete globalThis.ResizeObserver;
  });
});
