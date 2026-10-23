import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachTokenSuggestions, keyEntries, valueEntries } from '@konradmichalik/pagetree-facets/Filter/token-suggestions.js';

/*
 * Suggestions under the phrase field, derived from the configuration already
 * loaded: no request, no counts. The caret decides what is offered: a key while
 * a word is typed, the values of that key after its colon.
 */

globalThis.TYPO3 = { lang: {} };

const configuration = {
  tabs: [
    {
      identifier: 'doktype',
      label: 'Page type',
      configuration: {
        fields: [{
          type: 'checkbox-group',
          name: 'doktype',
          label: 'Page type',
          options: [{ value: '1', label: 'Standard' }, { value: '4', label: 'Shortcut' }],
        }],
      },
    },
    {
      identifier: 'ce',
      label: 'Content elements',
      configuration: {
        // Bucketed: one field per wizard group, all named `ce`.
        fields: [
          { type: 'checkbox-group', name: 'ce', label: 'Common', options: [{ value: 'text', label: 'Text' }] },
          { type: 'checkbox-group', name: 'ce', label: 'Special', options: [{ value: 'html', label: 'Plain HTML' }, { value: 'text', label: 'Text' }] },
        ],
      },
    },
    {
      identifier: 'activity',
      label: 'Activity',
      configuration: {
        fields: [
          { type: 'radio-presets', name: 'updated', label: 'Last updated', options: [{ value: '<7d', label: 'Within the last 7 days' }] },
          { type: 'user-picker', name: 'by', label: 'Edited by', options: [], currentUser: { uid: 1, username: 'admin' } },
          { type: 'user-picker', name: 'createdby', label: 'Created by', options: [], currentUser: { uid: 0, username: '' } },
          { type: 'text', name: 'note', label: 'Note' },
        ],
      },
    },
  ],
  sites: [{ identifier: 'main' }, { identifier: 'shop' }],
};

describe('keyEntries', () => {
  it('lists every field name once, named like its chips, then the site scope', () => {
    expect(keyEntries(configuration)).toEqual([
      { key: 'doktype', label: 'Page type' },
      { key: 'ce', label: 'Content elements' },
      { key: 'updated', label: 'Last updated' },
      { key: 'by', label: 'Edited by' },
      { key: 'createdby', label: 'Created by' },
      { key: 'note', label: 'Note' },
      { key: 'site', label: 'Site' },
    ]);
  });

  it('offers no site key without a site to pick', () => {
    expect(keyEntries({ tabs: [], sites: [] })).toEqual([]);
  });
});

describe('valueEntries', () => {
  it('merges the options of every field of that name, each value once', () => {
    expect(valueEntries(configuration, 'ce')).toEqual({
      heading: 'Content elements · ce:',
      values: [{ value: 'text', label: 'Text' }, { value: 'html', label: 'Plain HTML' }],
    });
  });

  it('offers "me" for a user picker that knows the current user, and nothing for one that does not', () => {
    expect(valueEntries(configuration, 'by').values).toEqual([{ value: 'me', label: 'Me (admin)' }]);
    expect(valueEntries(configuration, 'createdby').values).toEqual([]);
  });

  it('offers the sites for the site scope and nothing for an unknown key', () => {
    expect(valueEntries(configuration, 'site')).toEqual({
      heading: 'Site · site:',
      values: [{ value: 'main', label: 'main' }, { value: 'shop', label: 'shop' }],
    });
    expect(valueEntries(configuration, 'nothing')).toEqual({ heading: '', values: [] });
  });

  it('matches the key case-insensitively, as the parser does', () => {
    expect(valueEntries(configuration, 'Doktype').values).toHaveLength(2);
  });
});

describe('attachTokenSuggestions', () => {
  let anchor;
  let input;
  let caretLeft;

  beforeEach(() => {
    globalThis.TYPO3 = { lang: {} };
    anchor = document.createElement('div');
    input = document.createElement('input');
    input.type = 'text';
    anchor.append(input);
    document.body.append(anchor);
    caretLeft = vi.fn(() => 0);
    attachTokenSuggestions({ input, anchor, caretLeft, getConfiguration: () => configuration });
  });

  afterEach(() => {
    anchor.remove();
  });

  const list = () => anchor.querySelector('.pagetree-facets__suggestions');
  const options = () => [...list().querySelectorAll('[role="option"]')].map((option) => option.textContent);
  const typeAt = (value, caret = value.length) => {
    input.value = value;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const key = (name) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    return event;
  };

  it('makes the field a combobox over a listbox that starts closed', () => {
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-controls')).toBe(list().querySelector('[role="listbox"]').id);
    expect(list().hidden).toBe(true);
  });

  it('offers the keys matching the word at the caret, each with its label', () => {
    typeAt('is:hidden d');

    expect(list().hidden).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(list().querySelector('.pagetree-facets__suggestions-heading').textContent).toBe('Keys');
    expect(options()).toEqual(['doktypePage type']);
  });

  it('offers every key after a space, and matches keys case-insensitively', () => {
    typeAt('is:hidden ');
    expect(options()).toHaveLength(7);

    typeAt('is:hidden CREATED');
    expect(options()).toEqual(['createdbyCreated by']);
  });

  it('offers the values of the key after its colon, under a heading naming both', () => {
    typeAt('doktype:');

    expect(list().querySelector('.pagetree-facets__suggestions-heading').textContent).toBe('Page type · doktype:');
    expect(options()).toEqual(['1Standard', '4Shortcut']);
    expect(list().querySelector('[role="listbox"]').getAttribute('aria-labelledby'))
      .toBe(list().querySelector('.pagetree-facets__suggestions-heading').id);
  });

  it('filters the values by what follows the colon, on value and label', () => {
    typeAt('doktype:short');

    expect(options()).toEqual(['4Shortcut']);
  });

  it('offers the values again after a comma, for the next alternative', () => {
    typeAt('doktype:1,');

    expect(options()).toEqual(['1Standard', '4Shortcut']);
  });

  it('closes when nothing matches, or when the key has no values', () => {
    typeAt('doktype:zzz');
    expect(list().hidden).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');

    typeAt('note:');
    expect(list().hidden).toBe(true);
  });

  it('reads the token at the caret, not at the end of the phrase', () => {
    typeAt('d is:hidden', 1);

    expect(options()).toEqual(['doktypePage type']);
  });

  it('inserts a key with its colon on Enter and goes on to its values', () => {
    const changed = vi.fn();
    anchor.addEventListener('input', changed);
    typeAt('is:hidden dok');
    key('ArrowDown');

    const enter = key('Enter');

    expect(input.value).toBe('is:hidden doktype:');
    expect(input.selectionStart).toBe('is:hidden doktype:'.length);
    expect(enter.defaultPrevented).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(options()).toEqual(['1Standard', '4Shortcut']);
  });

  it('inserts a value, then a space for the next token, and closes', () => {
    typeAt('doktype:');
    key('ArrowDown');
    key('ArrowDown');

    key('Enter');

    expect(input.value).toBe('doktype:4 ');
    expect(input.selectionStart).toBe('doktype:4 '.length);
    expect(list().hidden).toBe(true);
  });

  it('keeps what follows the caret and adds no second space before it', () => {
    typeAt('doktype: is:hidden', 'doktype:'.length);
    key('ArrowDown');

    key('Enter');

    expect(input.value).toBe('doktype:1 is:hidden');
    expect(input.selectionStart).toBe('doktype:1 '.length);
  });

  it('replaces the rest of the alternative behind the caret, which would otherwise become a word of its own', () => {
    typeAt('doktype:s3', 'doktype:s'.length);
    key('ArrowDown');

    key('Enter');

    expect(input.value).toBe('doktype:1 ');
  });

  it('replaces the rest of a key behind the caret up to its colon', () => {
    typeAt('dokt:1', 'do'.length);
    key('ArrowDown');

    key('Enter');

    expect(input.value).toBe('doktype:1');
    expect(input.selectionStart).toBe('doktype:'.length);
  });

  it('closes when the caret moves without typing, since the entries belong to where it was', () => {
    for (const move of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      typeAt('doktype:');
      expect(list().hidden).toBe(false);

      key(move);

      expect(list().hidden).toBe(true);
    }

    typeAt('doktype:');
    input.dispatchEvent(new Event('click', { bubbles: true }));
    expect(list().hidden).toBe(true);
  });

  it('replaces only the alternative after the last comma', () => {
    typeAt('doktype:1,sh');
    key('ArrowDown');

    key('Enter');

    expect(input.value).toBe('doktype:1,4 ');
  });

  it('quotes a value with a space, as the grammar asks', () => {
    const spaced = {
      tabs: [{
        identifier: 'layout',
        label: 'Layouts',
        configuration: { fields: [{ type: 'select', name: 'layout', label: 'Layout', options: [{ value: 'two cols', label: 'Two columns' }] }] },
      }],
      sites: [],
    };
    attachTokenSuggestions({ input, anchor, caretLeft, getConfiguration: () => spaced });
    typeAt('layout:');
    key('ArrowDown');

    key('Enter');

    expect(input.value).toBe('layout:"two cols" ');
  });

  it('inserts on a click too, keeping focus in the field', () => {
    typeAt('doktype:');
    const option = list().querySelector('[role="option"]');
    const mousedown = new MouseEvent('mousedown', { cancelable: true });
    option.dispatchEvent(mousedown);

    option.click();

    expect(mousedown.defaultPrevented).toBe(true);
    expect(input.value).toBe('doktype:1 ');
  });

  it('leaves Enter to the modal while nothing is highlighted or the list is closed', () => {
    typeAt('doktype:');
    expect(key('Enter').defaultPrevented).toBe(false);

    key('Escape');
    expect(key('Enter').defaultPrevented).toBe(false);
    expect(input.value).toBe('doktype:');
  });

  it('moves the highlight with the arrows, wrapping, and reports it on the field', () => {
    typeAt('doktype:');
    const highlighted = () => list().querySelector('.is-highlighted')?.textContent;

    key('ArrowDown');
    expect(highlighted()).toBe('1Standard');
    expect(input.getAttribute('aria-activedescendant')).toBe(list().querySelector('.is-highlighted').id);
    expect(list().querySelector('.is-highlighted').getAttribute('aria-selected')).toBe('true');

    key('ArrowUp');
    expect(highlighted()).toBe('4Shortcut');

    key('ArrowDown');
    expect(highlighted()).toBe('1Standard');
  });

  it('opens on ArrowDown while closed, with the first entry highlighted', () => {
    typeAt('doktype:');
    key('Escape');
    expect(list().hidden).toBe(true);

    key('ArrowDown');

    expect(list().hidden).toBe(false);
    expect(list().querySelector('.is-highlighted').textContent).toBe('1Standard');
  });

  it('ignores ArrowUp while closed and ArrowDown with nothing to offer', () => {
    expect(key('ArrowUp').defaultPrevented).toBe(false);

    typeAt('note:');
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(list().hidden).toBe(true);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('closes on Escape without letting the modal see it, and lets Escape through once closed', () => {
    typeAt('doktype:');

    const escape = key('Escape');
    expect(list().hidden).toBe(true);
    expect(escape.defaultPrevented).toBe(true);

    expect(key('Escape').defaultPrevented).toBe(false);
  });

  it('closes on Tab and on blur, leaving the key to move focus', () => {
    typeAt('doktype:');
    expect(key('Tab').defaultPrevented).toBe(false);
    expect(list().hidden).toBe(true);

    typeAt('doktype:');
    input.dispatchEvent(new Event('blur'));
    expect(list().hidden).toBe(true);
  });

  it('explains the keys in a footer', () => {
    expect([...list().querySelectorAll('.pagetree-facets__suggestions-hint')].map((hint) => hint.textContent))
      .toEqual(['↑↓ choose', '↵ insert', 'Esc close']);
    expect(list().querySelectorAll('.pagetree-facets__suggestions-hint kbd')).toHaveLength(4);
  });

  it('opens under the field where the token starts, kept inside the anchor', () => {
    anchor.getBoundingClientRect = () => ({ left: 100, top: 0, width: 600, height: 40 });
    input.closest('.pagetree-facets__phrase')?.remove();
    const phrase = document.createElement('div');
    phrase.className = 'pagetree-facets__phrase';
    phrase.getBoundingClientRect = () => ({ left: 130 });
    anchor.prepend(phrase);
    phrase.append(input);
    caretLeft.mockReturnValue(50);

    typeAt('is:hidden dok');

    expect(caretLeft).toHaveBeenCalledWith('is:hidden '.length);
    expect(list().style.top).toBe('44px');
    expect(list().style.left).toBe('80px');

    // Past the anchor's edge, the list is pulled back in.
    list().getBoundingClientRect = () => ({ width: 320 });
    caretLeft.mockReturnValue(500);
    typeAt('is:hidden dok');
    expect(list().style.left).toBe('280px');
  });
});
