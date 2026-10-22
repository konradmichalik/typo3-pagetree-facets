import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFilterSearchInput, buildSearchResults, markMatches } from '@konradmichalik/pagetree-facets/Filter/search-results.js';

// One shared field object, as matches found in one configuration carry.
const stateField = { name: 'is', type: 'checkbox-group', label: 'State' };
const match = (overrides = {}) => ({
  tab: { identifier: 'state', label: 'State', configuration: { fields: [stateField] } },
  field: stateField,
  option: { value: 'hidden', label: 'Hidden' },
  ...overrides,
});

/** A tab whose criteria are spread over two fields with interchangeable presets. */
const activityTab = {
  identifier: 'activity',
  label: 'Activity',
  configuration: {
    fields: [
      { name: 'changed', type: 'radio-presets', label: 'Last updated' },
      { name: 'created', type: 'radio-presets', label: 'Created' },
    ],
  },
};
// A fresh field object per call: the view groups by field identity.
const activityMatch = (fieldLabel = 'Last updated') => ({
  tab: activityTab,
  field: { name: 'changed', type: 'radio-presets', label: fieldLabel },
  option: { value: '7d', label: 'Last 7 days' },
});

const deps = (control = null) => ({ findControl: vi.fn(() => control) });

const realCheckbox = (checked = false) => {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;

  return input;
};

/** Renders matches into a fresh result view and returns its element. */
const render = (matches, query = 'hid', dependencies = deps(realCheckbox()), onShowAll = vi.fn()) => {
  const results = buildSearchResults({ onShowAll });
  results.show(matches, query, dependencies);

  return results.element;
};
const heading = (element) => element.querySelector('.pagetree-facets__search-heading');
const groupTitles = (element) => [...element.querySelectorAll('.pagetree-facets__search-group-title')].map((title) => title.textContent);
const labels = (element) => [...element.querySelectorAll('.pagetree-facets__search-result-label')].map((label) => label.textContent);

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
  document.body.replaceChildren();
});

describe('a checkbox match', () => {
  it('is a plain checkbox that still writes back to the original control', () => {
    const control = realCheckbox(false);
    const element = render([match()], 'hid', deps(control));
    const proxy = element.querySelector('input');

    expect(proxy.type).toBe('checkbox');
    expect(proxy.getAttribute('role')).toBeNull();
    expect(element.querySelector('label').className).not.toContain('form-switch');

    proxy.checked = true;
    proxy.dispatchEvent(new Event('change'));

    expect(control.checked).toBe(true);
  });
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

    expect(wrap.querySelector('input').getAttribute('aria-label')).toBe('Find a criterion');
    expect(wrap.querySelector('input').placeholder).toBe('Find a criterion');
  });

  it('clears the search on Escape and keeps the key from the modal', () => {
    const onQuery = vi.fn();
    const wrap = buildFilterSearchInput({ onQuery });
    document.body.append(wrap);
    const input = wrap.querySelector('input');
    input.value = 'hid';
    input.dispatchEvent(new Event('input'));
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const reachedDocument = vi.fn();
    document.addEventListener('keydown', reachedDocument);

    input.dispatchEvent(escape);

    expect(input.value).toBe('');
    expect(onQuery).toHaveBeenLastCalledWith('');
    expect(wrap.querySelector('.pagetree-facets__clear').hidden).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(reachedDocument).not.toHaveBeenCalled();
    document.removeEventListener('keydown', reachedDocument);
  });

  it('lets Escape through while the field is empty, so the modal still closes on it', () => {
    const wrap = buildFilterSearchInput({ onQuery: vi.fn() });
    document.body.append(wrap);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

    wrap.querySelector('input').dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(false);
  });
});

describe('buildSearchResults', () => {
  it('starts hidden and shows itself with the first query', () => {
    const results = buildSearchResults({ onShowAll: vi.fn() });

    expect(results.element.hidden).toBe(true);
    results.show([match()], 'hid', deps(realCheckbox()));
    expect(results.element.hidden).toBe(false);
    results.hide();
    expect(results.element.hidden).toBe(true);
  });

  it('announces the count in a heading that is a polite live region', () => {
    const results = buildSearchResults({ onShowAll: vi.fn() });
    results.show([match(), match()], 'hid', deps(realCheckbox()));
    const live = heading(results.element);

    expect(live.tagName).toBe('H2');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('2 criteria match “hid”');

    // The same element is updated, never replaced: a live region announces
    // changes to its content, not its own arrival.
    results.show([match()], 'hidden', deps(realCheckbox()));
    expect(heading(results.element)).toBe(live);
    expect(live.textContent).toBe('1 criterion matches “hidden”');
  });

  it('keeps a query with $& literal in the heading', () => {
    expect(heading(render([match()], '$&')).textContent).toBe('1 criterion matches “$&”');
  });

  it('says so when nothing matched, with the note on what the search covers', () => {
    const element = render([], 'zzz');

    expect(heading(element).textContent).toBe('No criteria match “zzz”');
    expect(element.querySelector('.pagetree-facets__search-empty').textContent)
      .toBe('Try a shorter word, or choose a category on the left.');
    expect(element.querySelector('input')).toBeNull();
    expect(element.querySelector('.pagetree-facets__search-scope').textContent)
      .toBe('Only the criteria are searched here. To find a page by its title, use the field at the top.');
  });

  it('tells where Escape leads beside the heading, outside the live region', () => {
    const element = render([match()]);
    const hint = element.querySelector('.pagetree-facets__search-esc');

    expect(hint.textContent).toBe('Esc clears the search');
    expect(heading(element).contains(hint)).toBe(false);
  });

  it('groups the matches by facet, keeping the order they were found in', () => {
    const element = render([activityMatch(), match(), match({ option: { value: 'empty', label: 'Empty' } })]);

    expect(element.querySelectorAll('.pagetree-facets__search-group')).toHaveLength(2);
    expect(groupTitles(element)).toEqual(['Activity,›Last updated', 'State']);
    expect(labels(element)).toEqual(['Last 7 days', 'Hidden', 'Empty']);
  });

  it('names the field too where the facet alone does not identify the criterion', () => {
    // Activity offers the same presets under "Last updated" and "Created" - two
    // groups reading "Activity" would be indistinguishable.
    const element = render([activityMatch('Last updated'), activityMatch('Created')]);
    const titles = [...element.querySelectorAll('.pagetree-facets__search-group-title')];

    expect(titles).toHaveLength(2);
    expect(titles[0].textContent).toContain('Last updated');
    expect(titles[1].textContent).toContain('Created');
    // "›" would be announced as "greater than"; the comma is what separates the
    // two segments for a screen reader.
    expect(titles[0].querySelector('.pagetree-facets__search-result-origin').getAttribute('aria-hidden')).toBe('true');
    expect(titles[0].querySelector('.visually-hidden').textContent).toBe(',');
  });

  it('never says the same thing twice when a field carries its facet\'s own name', () => {
    expect(groupTitles(render([activityMatch('Activity')]))).toEqual(['Activity']);
  });

  it('offers Show all in <Facet> per group, which opens that facet', () => {
    const onShowAll = vi.fn();
    const element = render([match()], 'hid', deps(realCheckbox()), onShowAll);
    const showAll = element.querySelector('.pagetree-facets__search-show-all');

    expect(showAll.textContent).toBe('Show all in State');
    showAll.click();
    expect(onShowAll).toHaveBeenCalledWith('state');
  });

  it('marks the matched part of each label', () => {
    const element = render([match({ option: { value: 'x', label: 'Hidden or hidden' } })], 'hid');
    const label = element.querySelector('.pagetree-facets__search-result-label');

    expect(label.textContent).toBe('Hidden or hidden');
    expect([...label.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['Hid', 'hid']);
  });

  it('mirrors the real control state into the proxy', () => {
    const element = render([match()], 'hid', deps(realCheckbox(true)));

    expect(element.querySelector('input').checked).toBe(true);
  });

  it('writes back to the real control and fires change, which is what refreshes the modal', () => {
    const control = realCheckbox(false);
    const element = render([match()], 'hid', deps(control));
    const changed = vi.fn();
    control.addEventListener('change', changed);

    const proxy = element.querySelector('input');
    proxy.checked = true;
    proxy.dispatchEvent(new Event('change'));

    expect(control.checked).toBe(true);
    expect(changed).toHaveBeenCalled();
  });

  it('disables a proxy whose control is not in the DOM', () => {
    // Better visibly inert than a checkbox that silently does nothing.
    const element = render([match()], 'hid', deps(null));

    expect(element.querySelector('input').disabled).toBe(true);
  });

  it('does nothing if a disabled proxy is toggled anyway', () => {
    // Real UI cannot fire this on a disabled control, but the listener still
    // has to guard against it directly rather than assume the DOM enforces it.
    const element = render([match()], 'hid', deps(null));
    const proxy = element.querySelector('input');

    expect(() => proxy.dispatchEvent(new Event('change'))).not.toThrow();
  });

  it('renders radio presets as a synthetic group, away from the real field name', () => {
    const element = render([match({ field: { name: 'age', type: 'radio-presets' } })]);
    const proxy = element.querySelector('input');

    expect(proxy.type).toBe('radio');
    // The bracketed real name is what the generic collectors key off - colliding
    // with it here would make the proxies look like criteria of their own.
    expect(proxy.name).toBe('search-radio-state-age');
    expect(proxy.name).not.toContain('[');
  });

  it('exposes a description to screen readers without putting it in the label', () => {
    const element = render([match({ option: { value: 'x', label: 'X', description: 'Why this matters' } })], 'x');
    const proxy = element.querySelector('input');
    const help = element.querySelector('.pagetree-facets__search-result .visually-hidden');

    // The chips are derived from label text, so a description must stay out of the
    // visible label and be reachable only through aria-describedby.
    expect(help.textContent).toBe('Why this matters');
    expect(proxy.getAttribute('aria-describedby')).toBe(help.id);
    expect(element.querySelector('.pagetree-facets__search-result-label').textContent).toBe('X');
  });

  it('adds no help markup when there is no description', () => {
    const element = render([match()]);

    expect(element.querySelector('.pagetree-facets__search-result .visually-hidden')).toBeNull();
    expect(element.querySelector('input').getAttribute('aria-describedby')).toBeNull();
  });

  it('carries an option icon when one is configured', () => {
    const element = render([match({ option: { value: 'x', label: 'X', icon: 'actions-eye' } })], 'x');
    const icon = element.querySelector('typo3-backend-icon');

    expect(icon.getAttribute('identifier')).toBe('actions-eye');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('markMatches', () => {
  const marked = (label, query) => {
    const span = document.createElement('span');
    span.append(markMatches(label, query));

    return span;
  };

  it('wraps every occurrence, whatever its case', () => {
    const span = marked('News: News list', 'news');

    expect(span.textContent).toBe('News: News list');
    expect([...span.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['News', 'News']);
    expect(span.querySelector('mark').className).toBe('pagetree-facets__search-mark');
  });

  it('treats regex characters in the query as text', () => {
    const span = marked('C++ (beta)', '(beta)');

    expect(span.querySelector('mark').textContent).toBe('(beta)');
  });

  it('leaves a label plain when the query is not in it', () => {
    const span = marked('Hidden', 'xyz');

    expect(span.querySelector('mark')).toBeNull();
    expect(span.textContent).toBe('Hidden');
  });
});
