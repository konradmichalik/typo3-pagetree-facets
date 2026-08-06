import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderField } from '@konradmichalik/pagetree-facets/Filter/fields.js';

const tab = (state) => ({ identifier: 'state', state });
const deps = () => ({ getRoot: () => document.body, onLabelResolved: vi.fn() });

const render = (field, state) => renderField(tab(state), field, deps());

beforeEach(() => {
  globalThis.TYPO3 = { lang: {}, settings: { ajaxUrls: {} } };
});

describe('renderField', () => {
  it('labels every field through its legend', () => {
    const group = render({ name: 'is', type: 'checkbox-group', label: 'Page state', options: [] });

    expect(group.tagName).toBe('FIELDSET');
    expect(group.querySelector('legend').textContent).toBe('Page state');
  });

  it('names controls tab[field], which is how the collectors find them', () => {
    const group = render({ name: 'is', type: 'checkbox-group', options: [{ value: 'hidden', label: 'Hidden' }] });

    expect(group.querySelector('input').name).toBe('state[is]');
  });

  it('falls back to a text field for an unknown type', () => {
    // A third-party tab naming a type this version does not know still has to get a
    // usable control rather than an empty fieldset.
    const group = render({ name: 'note', type: 'something-new-in-v15', label: 'Note' });
    const input = group.querySelector('input');

    expect(input.type).toBe('text');
    expect(input.name).toBe('state[note]');
  });
});

describe('checkbox groups', () => {
  const field = {
    name: 'is',
    type: 'checkbox-group',
    options: [{ value: 'hidden', label: 'Hidden' }, { value: 'empty', label: 'Empty' }],
  };

  it('renders switches, matching how core styles boolean settings', () => {
    const group = render(field);

    expect([...group.querySelectorAll('input')].every((i) => 'checkbox' === i.type)).toBe(true);
    expect(group.querySelector('input').getAttribute('role')).toBe('switch');
    expect(group.querySelector('label').className).toContain('form-switch');
  });

  it('checks the options the hydrated state names', () => {
    const group = render(field, { is: ['empty'] });
    const [hidden, empty] = group.querySelectorAll('input');

    expect(hidden.checked).toBe(false);
    expect(empty.checked).toBe(true);
  });

  it('keeps the option label in its own span, away from any description', () => {
    // The chips are derived from this span, not from the label's whole textContent -
    // otherwise a screen-reader description would end up in the chip.
    const group = render({
      name: 'is',
      type: 'checkbox-group',
      options: [{ value: 'hidden', label: 'Hidden', description: 'Not visible in the frontend' }],
    });

    expect(group.querySelector('.pagetree-facets__option-label').textContent).toBe('Hidden');
    expect(group.querySelector('.visually-hidden').textContent).toBe('Not visible in the frontend');
  });

  it('tolerates a field without options', () => {
    expect(render({ name: 'is', type: 'checkbox-group' }).querySelectorAll('input')).toHaveLength(0);
  });
});

describe('radio presets', () => {
  const field = {
    name: 'age',
    type: 'radio-presets',
    options: [{ value: '7', label: 'Last week' }, { value: '30', label: 'Last month' }],
  };

  it('renders plain radios, not switches', () => {
    const group = render(field);
    const input = group.querySelector('input');

    // A switch implies an independent on/off, which does not fit an exclusive group.
    expect(input.type).toBe('radio');
    expect(input.getAttribute('role')).toBeNull();
    expect(group.querySelector('label').className).not.toContain('form-switch');
  });

  it('shares one name so the browser enforces exclusivity', () => {
    const names = new Set([...render(field).querySelectorAll('input')].map((i) => i.name));

    expect(names).toEqual(new Set(['state[age]']));
  });

  it('selects a scalar state value', () => {
    const group = render(field, { age: '30' });

    expect([...group.querySelectorAll('input')].map((i) => i.checked)).toEqual([false, true]);
  });
});

describe('select fields', () => {
  const field = {
    name: 'table',
    type: 'select',
    options: [{ value: 'tt_content', label: 'Content' }, { value: 'sys_file', label: 'File' }],
  };

  it('is a multiple select over the options', () => {
    const select = render(field).querySelector('select');

    expect(select.multiple).toBe(true);
    expect([...select.options].map((o) => o.value)).toEqual(['tt_content', 'sys_file']);
  });

  it('preselects what the state lists', () => {
    const select = render(field, { table: ['sys_file'] }).querySelector('select');

    expect([...select.selectedOptions].map((o) => o.value)).toEqual(['sys_file']);
  });
});

describe('text fields', () => {
  it('seeds from state, whether scalar or a single-element list', () => {
    expect(render({ name: 'q', type: 'text' }, { q: 'plain' }).querySelector('input').value).toBe('plain');
    expect(render({ name: 'q', type: 'text' }, { q: ['listed'] }).querySelector('input').value).toBe('listed');
  });

  it('comes with the clear button', () => {
    const group = render({ name: 'q', type: 'text' }, { q: 'something' });

    expect(group.querySelector('.pagetree-facets__clear')).not.toBeNull();
  });

  it('uses a placeholder as a hint only, never as the label', () => {
    const group = render({ name: 'q', type: 'text', label: 'Query', placeholder: 'e.g. news' });

    expect(group.querySelector('input').placeholder).toBe('e.g. news');
    expect(group.querySelector('legend').textContent).toBe('Query');
  });
});

describe('the user picker branch', () => {
  it('delegates to the picker module and passes its dependencies through', () => {
    const group = renderField(
      tab({ editor: 'me' }),
      { name: 'editor', type: 'user-picker', label: 'Edited by', currentUser: { uid: 1, username: 'admin' } },
      deps(),
    );
    const input = group.querySelector('input[data-picker]');

    expect(input).not.toBeNull();
    expect(input.name).toBe('state[editor]');
    expect(input.dataset.value).toBe('me');
  });
});
