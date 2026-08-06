import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFilterSearchInput, renderSearchResults } from '@konradmichalik/pagetree-facets/Filter/search-results.js';

const match = (overrides = {}) => ({
  tab: { identifier: 'state', label: 'State' },
  field: { name: 'is', type: 'checkbox-group' },
  option: { value: 'hidden', label: 'Hidden' },
  ...overrides,
});

const deps = (control = null) => ({
  findControl: vi.fn(() => control),
  renderOptionHelp: vi.fn(() => {
    const help = document.createElement('span');
    help.className = 'help';

    return help;
  }),
});

const realCheckbox = (checked = false) => {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;

  return input;
};

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
});

describe('buildFilterSearchInput', () => {
  it('reports every keystroke so the caller can filter as you type', () => {
    const onQuery = vi.fn();
    const wrap = buildFilterSearchInput({ clearable: (input) => input, onQuery });
    const input = wrap.querySelector('input');

    input.value = 'hid';
    input.dispatchEvent(new Event('input'));

    expect(onQuery).toHaveBeenCalledWith('hid');
  });

  it('keeps the data-role the modal looks it up by', () => {
    const wrap = buildFilterSearchInput({ clearable: (input) => input, onQuery: vi.fn() });

    expect(wrap.querySelector('[data-role="filter-search"]')).not.toBeNull();
  });

  it('is labelled for screen readers, not by placeholder alone', () => {
    const wrap = buildFilterSearchInput({ clearable: (input) => input, onQuery: vi.fn() });

    expect(wrap.querySelector('input').getAttribute('aria-label')).toBe('Search filters');
  });
});

describe('renderSearchResults', () => {
  it('says so when nothing matched', () => {
    const empty = renderSearchResults([], deps());

    expect(empty.textContent).toBe('No matching filters');
    expect(empty.querySelector('input')).toBeNull();
  });

  it('lists one row per match, naming its tab', () => {
    const list = renderSearchResults([match(), match()], deps());

    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(list.querySelector('.pagetree-facets__search-result-label').textContent).toBe('Hidden');
    expect(list.querySelector('.pagetree-facets__search-result-tab').textContent).toBe('State');
  });

  it('mirrors the real control state into the proxy', () => {
    const list = renderSearchResults([match()], deps(realCheckbox(true)));

    expect(list.querySelector('input').checked).toBe(true);
  });

  it('writes back to the real control and fires change, which is what refreshes the modal', () => {
    const control = realCheckbox(false);
    const list = renderSearchResults([match()], deps(control));
    const changed = vi.fn();
    control.addEventListener('change', changed);

    const proxy = list.querySelector('input');
    proxy.checked = true;
    proxy.dispatchEvent(new Event('change'));

    expect(control.checked).toBe(true);
    expect(changed).toHaveBeenCalled();
  });

  it('disables a proxy whose control is not in the DOM', () => {
    // Better visibly inert than a switch that silently does nothing.
    const list = renderSearchResults([match()], deps(null));

    expect(list.querySelector('input').disabled).toBe(true);
  });

  it('renders radio presets as a synthetic group, away from the real field name', () => {
    const list = renderSearchResults(
      [match({ field: { name: 'age', type: 'radio-presets' } })],
      deps(realCheckbox()),
    );
    const proxy = list.querySelector('input');

    expect(proxy.type).toBe('radio');
    // The bracketed real name is what the generic collectors key off - colliding
    // with it here would make the proxies look like criteria of their own.
    expect(proxy.name).toBe('search-radio-state-age');
    expect(proxy.name).not.toContain('[');
  });

  it('marks a checkbox proxy as a switch, matching the panels', () => {
    const list = renderSearchResults([match()], deps(realCheckbox()));
    const proxy = list.querySelector('input');

    expect(proxy.type).toBe('checkbox');
    expect(proxy.getAttribute('role')).toBe('switch');
  });

  it('adds the shared option help only when there is a description', () => {
    const withHelp = deps(realCheckbox());
    renderSearchResults([match({ option: { value: 'x', label: 'X', description: 'Why' } })], withHelp);
    expect(withHelp.renderOptionHelp).toHaveBeenCalled();

    const without = deps(realCheckbox());
    renderSearchResults([match()], without);
    expect(without.renderOptionHelp).not.toHaveBeenCalled();
  });

  it('carries an option icon when one is configured', () => {
    const list = renderSearchResults(
      [match({ option: { value: 'x', label: 'X', icon: 'actions-eye' } })],
      deps(realCheckbox()),
    );
    const icon = list.querySelector('typo3-backend-icon');

    expect(icon.getAttribute('identifier')).toBe('actions-eye');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });
});
