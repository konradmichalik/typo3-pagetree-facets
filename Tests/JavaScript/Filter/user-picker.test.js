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
  const element = renderUserPicker(tab, { ...field, ...fieldOverrides }, state, { getRoot: () => root, onLabelResolved });
  root.append(element);
  const input = element.querySelector('input');

  return {
    element,
    input,
    results: () => root.querySelector('.pagetree-facets__user-results'),
    /** What the chip inside the field reads, null while nothing is picked. */
    chip: () => element.querySelector('.pagetree-facets__chip-label')?.textContent ?? null,
    chipRemove: () => element.querySelector('.pagetree-facets__chip-remove'),
    hint: () => root.querySelector('.pagetree-facets__user-hint'),
  };
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
    const { input, chip } = mount('me');

    expect(chip()).toBe('Me (admin)');
    expect(input.value).toBe('');
    expect(input.dataset.value).toBe('me');
    expect(requests()).toHaveLength(0);
  });

  it('resolves a bare uid to its label and reports it upwards', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Erika Editor' }] }));
    const { input, chip } = mount('7');

    // Before the round trip the uid stands in as the chip's text.
    expect(chip()).toBe('7');
    await vi.waitFor(() => expect(chip()).toBe('Erika Editor'));
    expect(input.dataset.label).toBe('Erika Editor');
    // The chips are derived from the live controls, so they have to be rebuilt.
    expect(onLabelResolved).toHaveBeenCalled();
  });

  it('seeds nothing for an empty state list, same as a missing value', () => {
    const { input, chip } = mount([]);

    expect(input.value).toBe('');
    expect(chip()).toBeNull();
    expect(requests()).toHaveLength(0);
  });

  it('leaves "me" unresolved as a literal value when the field carries no current user', () => {
    // pinnedLabel() only special-cases "me" when field.currentUser was given -
    // without it, "me" falls through to the real uid lookup like any other value.
    const { input, chip } = mount('me', { currentUser: undefined });

    expect(input.dataset.value).toBe('me');
    expect(chip()).toBe('me');
  });

  it('leaves the visible uid alone when the lookup finds no matching user', async () => {
    respondWith(() => ({ users: [] }));
    const { chip } = mount('7');

    await vi.waitFor(() => expect(requests()).toHaveLength(1));
    expect(chip()).toBe('7');
    expect(onLabelResolved).not.toHaveBeenCalled();
  });

  it('resolves to null instead of throwing when the lookup request fails', async () => {
    respondWith(() => {
      throw new Error('network down');
    });
    const { chip } = mount('7');

    await vi.waitFor(() => expect(requests()).toHaveLength(1));
    expect(chip()).toBe('7');
    expect(onLabelResolved).not.toHaveBeenCalled();
  });

  it('discards a resolved label if the value moved on meanwhile', async () => {
    let release;
    respondWith(() => new Promise((resolve) => {
      release = () => resolve({ users: [{ uid: 7, label: 'Erika Editor' }] });
    }));
    const { input, chip } = mount('7');

    input.value = 'something else';
    input.dispatchEvent(new Event('input'));
    release();

    await vi.waitFor(() => expect(requests()).toHaveLength(1));
    expect(input.value).toBe('something else');
    expect(chip()).toBeNull();
    expect(onLabelResolved).not.toHaveBeenCalled();
  });

  it('pins "Me" as the first suggestion on focus, before any typing', () => {
    const { input, results } = mount(undefined);

    input.dispatchEvent(new Event('focus'));

    expect(options(results)).toEqual(['Me (admin)']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('leaves a typed query alone on focus instead of replacing its results with "Me"', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Erika Editor' }] }));
    const { input, results } = mount(undefined);
    input.value = 'er';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    input.dispatchEvent(new Event('focus'));

    expect(results().hidden).toBe(true);
    expect(options(results)).toEqual(['Me (admin)', 'Erika Editor']);
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

  it('ignores a stale response that arrives after a newer one already rendered', async () => {
    const releasers = {};
    respondWith(({ q }) => new Promise((resolve) => {
      releasers[q] = () => resolve({ users: [{ uid: 1, label: `hit for ${q}` }] });
    }));
    const { input, results } = mount(undefined);

    input.value = 'aa';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);
    input.value = 'bb';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    // The newer request settles first; the older one is still in flight.
    releasers.bb();
    await vi.waitFor(() => expect(options(results)).toContain('hit for bb'));

    releasers.aa();
    await Promise.resolve();
    expect(options(results)).toEqual(['Me (admin)', 'hit for bb']);
  });

  it('typing invalidates a previous selection and takes its chip away', async () => {
    const { input, chip } = mount('me');

    input.value = 'Er';
    input.dispatchEvent(new Event('input'));

    expect(input.dataset.value).toBeUndefined();
    expect(input.dataset.label).toBeUndefined();
    await vi.waitFor(() => expect(chip()).toBeNull());
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

  it('reopens the existing suggestions on ArrowDown after Escape, without searching again', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Erika Editor' }] }));
    const { input, results } = mount(undefined);
    input.value = 'er';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(results().hidden).toBe(true);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(results().hidden).toBe(false);
    expect(options(results)).toEqual(['Me (admin)', 'Erika Editor']);
    expect(requests()).toHaveLength(1);
  });

  it('clears the highlight rather than leaving a stale descendant when there is nothing to highlight', () => {
    const element = renderUserPicker(tab, { name: 'editor' }, undefined, { getRoot: () => root, onLabelResolved });
    root.append(element);
    const input = element.querySelector('input');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('ignores ArrowUp while the list is not open', () => {
    const { input } = mount(undefined);

    expect(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))).not.toThrow();
  });

  it('ignores Enter when nothing is highlighted yet', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('focus'));

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(input.dataset.value).toBeUndefined();
    expect(results().hidden).toBe(false);
  });

  it('selects the highlighted suggestion on Enter and stops the event there', () => {
    const { input, results, chip } = mount(undefined);
    // Really focused, as in the browser: the pick keeps focus where it is.
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const reachedModal = vi.fn();
    root.addEventListener('keydown', reachedModal);
    input.dispatchEvent(enter);

    expect(input.dataset.value).toBe('me');
    expect(chip()).toBe('Me (admin)');
    expect(input.value).toBe('');
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

  it('closes on blur, delayed so a click on a suggestion can register first', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('blur'));
    // Blurring without ever having opened the list must not throw even though
    // there is no scroll listener yet to tear down.
    expect(results().hidden).toBe(true);

    input.dispatchEvent(new Event('focus'));
    expect(results().hidden).toBe(false);

    input.dispatchEvent(new Event('blur'));
    expect(results().hidden).toBe(false);
    vi.advanceTimersByTime(150);
    expect(results().hidden).toBe(true);
  });

  it('keeps focus on the input for a mouse selection instead of letting it blur first', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('focus'));
    const option = results().querySelector('[role="option"]');

    const mousedown = new MouseEvent('mousedown', { cancelable: true });
    option.dispatchEvent(mousedown);

    expect(mousedown.defaultPrevented).toBe(true);
  });

  it('selects a real search result by its uid, not by a value field it does not have', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Erika Editor' }] }));
    const { input, results, chip } = mount(undefined);
    input.value = 'er';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    const [, searchResult] = results().querySelectorAll('[role="option"]');
    searchResult.click();

    expect(input.dataset.value).toBe('7');
    expect(chip()).toBe('Erika Editor');
  });

  it('reparents the dropdown to the root so the scrolling panel cannot clip it', () => {
    const panel = document.createElement('div');
    root.append(panel);
    const { element, input, results } = mount(undefined);
    panel.append(element);

    input.dispatchEvent(new Event('focus'));

    expect(results().parentElement).toBe(root);
  });

  it('ignores the scroll that focusing a field below the fold causes, one frame after opening', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('focus'));

    document.dispatchEvent(new Event('scroll'));

    expect(results().hidden).toBe(false);
  });

  it('drops its document-level scroll listener when closed', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('focus'));
    vi.advanceTimersToNextFrame();

    document.dispatchEvent(new Event('scroll'));

    // The listener is a capture one on document; firing scroll hides the list and
    // unregisters, so a second scroll has nothing left to do.
    expect(results().hidden).toBe(true);
  });

  it('stays open when the list itself scrolls, by wheel or by the arrow keys', () => {
    const { input, results } = mount(undefined);
    input.dispatchEvent(new Event('focus'));

    results().dispatchEvent(new Event('scroll'));

    expect(results().hidden).toBe(false);
  });

  const stubRect = (element, rect) => {
    element.getBoundingClientRect = () => ({ left: 0, width: 200, ...rect });
  };

  // The list is measured against the field box, which holds the chip beside the input.
  it('opens below the field when the list fits there', () => {
    const { element, input, results } = mount(undefined);
    stubRect(root, { top: 0, bottom: 400 });
    stubRect(element, { top: 20, bottom: 50 });
    stubRect(results(), { height: 150 });

    input.dispatchEvent(new Event('focus'));

    expect(results().style.top).toBe('54px');
  });

  it('opens above the field when the list would run into the modal footer', () => {
    const { element, input, results } = mount(undefined);
    stubRect(root, { top: 0, bottom: 300 });
    stubRect(element, { top: 260, bottom: 290 });
    stubRect(results(), { height: 150 });

    input.dispatchEvent(new Event('focus'));

    expect(results().style.top).toBe('106px');
  });

  it('measures the space below against the visible modal body, not the taller root', () => {
    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    document.body.append(modalBody);
    modalBody.append(root);
    const { element, input, results } = mount(undefined);
    stubRect(modalBody, { top: 0, bottom: 200 });
    stubRect(root, { top: 0, bottom: 480 });
    stubRect(element, { top: 150, bottom: 180 });
    stubRect(results(), { height: 100 });

    input.dispatchEvent(new Event('focus'));

    expect(results().style.top).toBe('46px');
    modalBody.remove();
  });

  it('keeps root coordinates when the modal body has scrolled the root partly out of view', () => {
    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    document.body.append(modalBody);
    modalBody.append(root);
    const { element, input, results } = mount(undefined);
    stubRect(modalBody, { top: 100, bottom: 300 });
    stubRect(root, { top: 50, bottom: 530 });
    stubRect(element, { top: 250, bottom: 280 });
    stubRect(results(), { height: 100 });

    input.dispatchEvent(new Event('focus'));

    // Above the input, inside the visible body: 250 - 4 - 100 = 146 in the
    // viewport, which is 96px from the root's own top.
    expect(results().style.top).toBe('96px');
    modalBody.remove();
  });

  it('caps the list to the larger side when it fits neither above nor below', () => {
    const { element, input, results } = mount(undefined);
    stubRect(root, { top: 0, bottom: 300 });
    stubRect(element, { top: 160, bottom: 190 });
    stubRect(results(), { height: 192 });

    input.dispatchEvent(new Event('focus'));

    expect(results().style.top).toBe('0px');
    expect(results().style.maxHeight).toBe('156px');
  });

  it('measures the list only once it is positioned and sized like the field', () => {
    const { element, input, results } = mount(undefined);
    stubRect(root, { top: 0, bottom: 400 });
    stubRect(element, { top: 20, bottom: 50, width: 180 });
    let measuredAs;
    results().getBoundingClientRect = () => {
      measuredAs = [results().style.position, results().style.width];

      return { height: 100 };
    };

    input.dispatchEvent(new Event('focus'));

    expect(measuredAs).toEqual(['absolute', '180px']);
  });

  it('scrolls only the list to reveal the highlighted option, never its ancestors', () => {
    const { input, results } = mount(undefined, { pinned: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    input.dispatchEvent(new Event('focus'));
    const list = results();
    Object.defineProperty(list, 'clientHeight', { value: 50 });
    Object.defineProperty(list, 'scrollTop', { value: 0, writable: true });
    list.querySelectorAll('[role="option"]').forEach((option, index) => {
      Object.defineProperty(option, 'offsetTop', { value: index * 40 });
      Object.defineProperty(option, 'offsetHeight', { value: 40 });
    });

    ['ArrowDown', 'ArrowDown', 'ArrowDown'].forEach((key) => input.dispatchEvent(new KeyboardEvent('keydown', { key })));
    expect(list.scrollTop).toBe(70);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(list.scrollTop).toBe(0);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('names the combobox after the field label, not after its placeholder', () => {
    const { input } = mount(undefined, { label: 'Edited by' });

    expect(input.getAttribute('aria-label')).toBe('Edited by');
  });

  it('is a read-only pick list when the field is not searchable', () => {
    const { input } = mount(undefined, { searchable: false });

    expect(input.readOnly).toBe(true);
    expect(input.getAttribute('aria-autocomplete')).toBe('none');
  });

  it('opens on focus even with a value when the field is not searchable', () => {
    const { input, results } = mount('me', { searchable: false });

    input.dispatchEvent(new Event('focus'));

    expect(results().hidden).toBe(false);
  });

  it('offers only the pinned entries and never searches when the field is not searchable', async () => {
    const { input, results } = mount(undefined, { searchable: false });

    input.value = 'er';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    expect(requests()).toHaveLength(0);
    expect(options(results)).toEqual(['Me (admin)']);
  });

  it('does not invite a search in the placeholder when the field is not searchable', () => {
    globalThis.TYPO3.lang = {
      'pagetreeFacets.modal.userSearchPlaceholder': 'Search backend user…',
      'pagetreeFacets.modal.userPickPlaceholder': 'Pick from the list…',
    };

    expect(mount(undefined).input.placeholder).toBe('Search backend user…');
    expect(mount(undefined, { searchable: false }).input.placeholder).toBe('Pick from the list…');
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
    const { input, chip } = mount('none', { pinned: [{ value: 'none', label: 'Unassigned' }] });

    expect(chip()).toBe('Unassigned');
    expect(input.dataset.value).toBe('none');
    expect(requests()).toHaveLength(0);
  });

  it('seeds a pinned value even with an empty-string label, rather than falling through to a uid lookup', () => {
    const { input, chip } = mount('none', { pinned: [{ value: 'none', label: '' }] });

    expect(chip()).toBe('');
    expect(input.dataset.value).toBe('none');
    expect(input.dataset.label).toBe('');
    expect(requests()).toHaveLength(0);
  });

  it('selects a pinned entry through the same dataset.value contract as a real user', () => {
    const { input, results, chip } = mount(undefined, { pinned: [{ value: 'none', label: 'Unassigned' }] });
    input.dispatchEvent(new Event('focus'));
    const [, pinnedOption] = [...results().querySelectorAll('[role="option"]')];

    pinnedOption.click();

    expect(input.dataset.value).toBe('none');
    expect(chip()).toBe('Unassigned');
  });

  it('renders a pinned entry\'s icon decoratively', () => {
    const { input, results } = mount(undefined, { pinned: [{ value: 'none', label: 'Unassigned', icon: 'actions-user' }] });

    input.dispatchEvent(new Event('focus'));

    const icon = results().querySelector('[role="option"] typo3-backend-icon');
    expect(icon.getAttribute('identifier')).toBe('actions-user');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives the chip its own ×, which empties the pick, tells the modal and keeps focus in the field', () => {
    const { input, chip, chipRemove } = mount('me');
    const changed = vi.fn();
    root.addEventListener('change', changed);
    expect(chipRemove().getAttribute('aria-label')).toBe('Remove Me (admin)');

    chipRemove().click();

    expect(chip()).toBeNull();
    expect(input.dataset.value).toBeUndefined();
    expect(input.dataset.label).toBeUndefined();
    expect(input.value).toBe('');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
  });

  it('hides the placeholder while a user is picked, the chip being the field\'s content', () => {
    const { input, chipRemove } = mount('me');
    expect(input.placeholder).toBe('');

    chipRemove().click();

    expect(input.placeholder).toBe('Search backend user…');
  });

  it('follows the dataset when the modal clears the control from outside', async () => {
    // A chip's × in the criteria row and Clear all unset the dataset directly
    // (see clearControl in Filter/fields.js), without an event on the input.
    const { input, chip } = mount('me');
    expect(chip()).toBe('Me (admin)');

    delete input.dataset.value;
    delete input.dataset.label;

    await vi.waitFor(() => expect(chip()).toBeNull());
  });

  it('asks for one more character below two, with "Me" still on offer', () => {
    const { input, results, hint } = mount(undefined);

    input.value = 'k';
    input.dispatchEvent(new Event('input'));

    expect(results().hidden).toBe(false);
    expect(options(results)).toEqual(['Me (admin)']);
    expect(hint().textContent).toBe('Type one more character to search users');
  });

  it('shows no hint before anything is typed', () => {
    const { input, hint } = mount(undefined);

    input.dispatchEvent(new Event('focus'));

    expect(hint().hidden).toBe(true);
  });

  it('says that nothing matches, naming the query, with "Me" still on offer', async () => {
    respondWith(() => ({ users: [] }));
    const { input, results, hint } = mount(undefined);

    input.value = 'kox';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    expect(options(results)).toEqual(['Me (admin)']);
    expect(hint().textContent).toBe("No user matches 'kox'");
    expect(hint().hidden).toBe(false);
  });

  it('shows the hint alone when there is no "Me" to offer either', async () => {
    respondWith(() => ({ users: [] }));
    const { input, results, hint } = mount(undefined, { currentUser: undefined });

    input.value = 'kox';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    expect(results().hidden).toBe(false);
    expect(options(results)).toEqual([]);
    expect(hint().hidden).toBe(false);
  });

  it('marks the matched part of each result, but not of "Me"', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Kora Lindner (klindner)' }] }));
    const { input, results } = mount(undefined);

    input.value = 'ko';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    const [me, kora] = results().querySelectorAll('[role="option"]');
    expect(me.querySelector('mark')).toBeNull();
    expect([...kora.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['Ko']);
    expect(kora.textContent).toBe('Kora Lindner (klindner)');
  });

  it('keeps a disabled account in the list and says so', async () => {
    respondWith(() => ({ users: [{ uid: 8, label: 'editor-koeln', disabled: true }, { uid: 9, label: 'Jakob Kohl (jkohl)', disabled: false }] }));
    const { input, results } = mount(undefined);

    input.value = 'ko';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    const [, dormant, active] = results().querySelectorAll('[role="option"]');
    expect(dormant.querySelector('.pagetree-facets__user-disabled').textContent).toBe('Disabled');
    expect(active.querySelector('.pagetree-facets__user-disabled')).toBeNull();
  });

  it('offers no "Me" entry when the server sent no current user', async () => {
    respondWith(() => ({ users: [{ uid: 7, label: 'Erika Editor' }] }));
    const element = renderUserPicker(tab, { name: 'editor' }, undefined, { getRoot: () => root, onLabelResolved });
    root.append(element);
    const input = element.querySelector('input');

    input.value = 'er';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);

    expect([...root.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['Erika Editor']);
  });
});
