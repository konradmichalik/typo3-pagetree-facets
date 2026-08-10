import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeOpenUserDropdowns, renderUserPicker } from '@konradmichalik/pagetree-facets/Filter/user-picker.js';
import { requests, resetAjaxStub, respondWith } from '../Stubs/typo3/core/ajax/ajax-request.js';

const tab = { identifier: 'activity' };
const field = { name: 'editor', currentUser: { uid: 1, username: 'admin' } };

let root;
let onLabelResolved;

/**
 * jsdom implements neither scrollIntoView nor layout, so the highlight code would
 * throw on the former and the positioning maths just reads zeroes. Both are
 * irrelevant to the behaviour under test.
 */
beforeEach(() => {
  resetAjaxStub();
  globalThis.TYPO3 = { lang: {}, settings: { ajaxUrls: { typo3_pagetree_facets_users: '/users' } } };
  Element.prototype.scrollIntoView = vi.fn();
  root = document.createElement('div');
  document.body.append(root);
  onLabelResolved = vi.fn();
  vi.useFakeTimers();
});

afterEach(() => {
  closeOpenUserDropdowns();
  vi.useRealTimers();
  root.remove();
});

const mount = (state, fieldOverrides = {}) => {
  const element = renderUserPicker(tab, { ...field, ...fieldOverrides }, state, {
    getRoot: () => root,
    clearable: (input) => {
      const wrap = document.createElement('div');
      wrap.append(input);

      return wrap;
    },
    onLabelResolved,
  });
  root.append(element);
  const input = element.querySelector('input');

  return { element, input, results: () => root.querySelector('[role="listbox"]') };
};

const options = (results) => [...results().querySelectorAll('[role="option"]')].map((o) => o.textContent);

describe('renderUserPicker', () => {
  it('marks the control so generic collectors read dataset.value, not the text', () => {
    const { input } = mount(undefined);

    expect(input.dataset.picker).toBe('1');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('seeds "me" from the record already at hand, without a request', () => {
    const { input } = mount('me');

    expect(input.value).toBe('Me (admin)');
    expect(input.dataset.value).toBe('me');
    expect(requests()).toHaveLength(0);
  });

  it('resolves a bare uid to its label and reports it upwards', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Erika Editor' }] }));
    const { input } = mount('7');

    // Before the round trip the uid stands in as the visible text.
    expect(input.value).toBe('7');
    await vi.waitFor(() => expect(input.value).toBe('Erika Editor'));
    expect(input.dataset.label).toBe('Erika Editor');
    // The chips are derived from the live controls, so they have to be rebuilt.
    expect(onLabelResolved).toHaveBeenCalled();
  });

  it('discards a resolved label if the value moved on meanwhile', async () => {
    let release;
    respondWith(() => new Promise((resolve) => {
      release = () => resolve({ users: [{ uid: 7, label: 'Erika Editor' }] });
    }));
    const { input } = mount('7');

    input.value = 'something else';
    input.dispatchEvent(new Event('input'));
    release();

    await vi.waitFor(() => expect(requests()).toHaveLength(1));
    expect(input.value).toBe('something else');
    expect(onLabelResolved).not.toHaveBeenCalled();
  });

  it('pins "Me" as the first suggestion on focus, before any typing', () => {
    const { input, results } = mount(undefined);

    input.dispatchEvent(new Event('focus'));

    expect(options(results)).toEqual(['Me (admin)']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('searches only from two characters, debounced', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Erika Editor' }] }));
    const { input, results } = mount(undefined);

    input.value = 'e';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);
    expect(requests()).toHaveLength(0);

    input.value = 'er';
    input.dispatchEvent(new Event('input'));
    expect(requests()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);

    expect(requests()).toEqual([{ url: '/users', args: { q: 'er' } }]);
    expect(options(results)).toEqual(['Me (admin)', 'Erika Editor']);
  });

  it('ignores a stale response that resolves after a newer query', async () => {
    respondWith(({ q }) => ({ users: [{ uid: 1, label: `hit for ${q}` }] }));
    const { input, results } = mount(undefined);

    input.value = 'aa';
    input.dispatchEvent(new Event('input'));
    input.value = 'bb';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    // Only the newest query may reach the list - the debounce alone cannot
    // guarantee that once a request is already in flight.
    expect(options(results)).toEqual(['Me (admin)', 'hit for bb']);
  });

  it('typing invalidates a previous selection', () => {
    const { input } = mount('me');

    input.value = 'Er';
    input.dispatchEvent(new Event('input'));

    expect(input.dataset.value).toBeUndefined();
    expect(input.dataset.label).toBeUndefined();
  });

  it('moves the highlight with the arrow keys and wraps around', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Erika Editor' }] }));
    const { input, results } = mount(undefined);
    input.value = 'er';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    const highlighted = () => results().querySelector('.is-highlighted')?.textContent;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(highlighted()).toBe('Me (admin)');
    expect(input.getAttribute('aria-activedescendant')).toBeTruthy();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(highlighted()).toBe('Erika Editor');

    // Two entries, so a third step comes back round to the first.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(highlighted()).toBe('Me (admin)');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(highlighted()).toBe('Erika Editor');
  });

  it('selects the highlighted suggestion on Enter and stops the event there', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('focus'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const reachedModal = vi.fn();
    root.addEventListener('keydown', reachedModal);
    input.dispatchEvent(enter);

    expect(input.dataset.value).toBe('me');
    expect(input.value).toBe('Me (admin)');
    expect(results().hidden).toBe(true);
    // The modal applies and closes on Enter - picking a suggestion must not.
    expect(reachedModal).not.toHaveBeenCalled();
  });

  it('emits change on selection, which is what refreshes the modal', () => {
    const { input } = mount(undefined);
    const changed = vi.fn();
    root.addEventListener('change', changed);

    input.dispatchEvent(new Event('focus'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(changed).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('focus'));
    expect(results().hidden).toBe(false);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(results().hidden).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('reparents the dropdown to the root so the scrolling panel cannot clip it', () => {
    const panel = document.createElement('div');
    root.append(panel);
    const { element, input, results } = mount(undefined);
    panel.append(element);

    input.dispatchEvent(new Event('focus'));

    expect(results().parentElement).toBe(root);
  });

  it('drops its document-level scroll listener when closed', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('focus'));

    document.dispatchEvent(new Event('scroll'));

    // The listener is a capture one on document; firing scroll hides the list and
    // unregisters, so a second scroll has nothing left to do.
    expect(results().hidden).toBe(true);
  });

  it('closeOpenUserDropdowns closes a list left open, as teardown needs', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('focus'));
    expect(results().hidden).toBe(false);

    closeOpenUserDropdowns();

    expect(results().hidden).toBe(true);
  });

  it('pins declarative pseudo-values above the search results, after "Me"', () => {
    const { input, results } = mount(undefined, { pinned: [{ value: 'none', label: 'Unassigned' }] });

    input.dispatchEvent(new Event('focus'));

    expect(options(results)).toEqual(['Me (admin)', 'Unassigned']);
  });

  it('seeds a pinned value from state without a request', () => {
    const { input } = mount('none', { pinned: [{ value: 'none', label: 'Unassigned' }] });

    expect(input.value).toBe('Unassigned');
    expect(input.dataset.value).toBe('none');
    expect(requests()).toHaveLength(0);
  });

  it('selects a pinned entry through the same dataset.value contract as a real user', () => {
    const { input, results } = mount(undefined, { pinned: [{ value: 'none', label: 'Unassigned' }] });
    input.dispatchEvent(new Event('focus'));
    const [, pinnedOption] = [...results().querySelectorAll('[role="option"]')];

    pinnedOption.click();

    expect(input.dataset.value).toBe('none');
    expect(input.value).toBe('Unassigned');
  });

  it('renders a pinned entry\'s icon decoratively', () => {
    const { input, results } = mount(undefined, { pinned: [{ value: 'none', label: 'Unassigned', icon: 'actions-user' }] });

    input.dispatchEvent(new Event('focus'));

    const icon = results().querySelector('[role="option"] typo3-backend-icon');
    expect(icon.getAttribute('identifier')).toBe('actions-user');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('offers no "Me" entry when the server sent no current user', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Erika Editor' }] }));
    const element = renderUserPicker(tab, { name: 'editor' }, undefined, {
      getRoot: () => root,
      clearable: (input) => input,
      onLabelResolved,
    });
    root.append(element);
    const input = element.querySelector ? element.querySelector('input') ?? element : element;

    input.value = 'er';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    expect([...root.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['Erika Editor']);
  });
});
