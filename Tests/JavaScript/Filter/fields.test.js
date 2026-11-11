import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearControl, renderField, syncGroupToggle } from '@konradmichalik/pagetree-facets/Filter/fields.js';

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

  it('renders checkboxes, since nothing applies before Apply', () => {
    const group = render(field);

    expect([...group.querySelectorAll('input')].every((i) => 'checkbox' === i.type)).toBe(true);
    expect(group.querySelector('input').getAttribute('role')).toBeNull();
    expect(group.querySelector('label').className).not.toContain('form-switch');
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

  it('renders a decorative icon next to an option that declares one', () => {
    const group = render({
      name: 'is',
      type: 'checkbox-group',
      options: [{ value: 'hidden', label: 'Hidden', icon: 'actions-eye-slash' }],
    });

    const icon = group.querySelector('typo3-backend-icon');
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('identifier')).toBe('actions-eye-slash');
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

    expect([...group.querySelectorAll('input')].map((i) => i.checked)).toEqual([false, false, true]);
  });

  it('starts with Any time, checked while the state names no value', () => {
    const inputs = [...render(field).querySelectorAll('input')];

    expect(inputs[0].value).toBe('');
    expect(inputs[0].closest('label').textContent).toContain('Any time');
    expect(inputs.map((i) => i.checked)).toEqual([true, false, false]);
  });

  it('leaves Any time unchecked for a hydrated value, scalar or list', () => {
    for (const state of ['30', ['30']]) {
      const inputs = [...render(field, { age: state }).querySelectorAll('input')];

      expect(inputs.map((i) => i.checked)).toEqual([false, false, true]);
    }
  });

  it('takes the label of Any time from the language file', () => {
    globalThis.TYPO3.lang['pagetreeFacets.modal.anyTime'] = 'Beliebig';

    expect(render(field).querySelector('input').closest('label').textContent).toContain('Beliebig');
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

  it('tolerates a field without options', () => {
    const select = render({ name: 'table', type: 'select' }).querySelector('select');

    expect(select.options).toHaveLength(0);
  });
});

describe('text fields', () => {
  it('seeds from state, whether scalar or a single-element list', () => {
    expect(render({ name: 'q', type: 'text' }, { q: 'plain' }).querySelector('input').value).toBe('plain');
    expect(render({ name: 'q', type: 'text' }, { q: ['listed'] }).querySelector('input').value).toBe('listed');
  });

  it('starts empty when the tab has no hydrated state for it at all', () => {
    expect(render({ name: 'q', type: 'text' }).querySelector('input').value).toBe('');
  });

  it('starts empty for an empty state list too', () => {
    expect(render({ name: 'q', type: 'text' }, { q: [] }).querySelector('input').value).toBe('');
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

describe('a group heading checkbox', () => {
  const field = {
    name: 'ce',
    type: 'checkbox-group',
    label: 'Menu',
    options: [{ value: 'menu_pages', label: 'Pages' }, { value: 'menu_subpages', label: 'Subpages' }, { value: 'menu_sitemap', label: 'Sitemap' }],
  };
  const mount = (state) => {
    const group = renderField(tab(state), field, { ...deps(), groupToggle: true });
    document.body.replaceChildren(group);

    return { group, toggle: group.querySelector('.pagetree-facets__group-toggle'), options: [...group.querySelectorAll('input[name]')] };
  };

  it('is only there for a field that is one group of a split criterion', () => {
    expect(render(field).querySelector('.pagetree-facets__group-toggle')).toBeNull();
    expect(mount().toggle).not.toBeNull();
  });

  it('sits in the legend, named for what it does, next to the group name and its size', () => {
    const { group, toggle } = mount();
    const legend = group.querySelector('legend');

    expect(legend.contains(toggle)).toBe(true);
    expect(toggle.getAttribute('aria-label')).toBe('Select all Menu');
    expect(toggle.hasAttribute('name')).toBe(false);
    expect(legend.querySelector('.pagetree-facets__group-label').textContent).toBe('Menu');
    expect(legend.querySelector('.pagetree-facets__group-count').textContent).toBe('(3)');
  });

  it('keeps a replacement pattern in the group name literal', () => {
    const group = renderField(tab(), { ...field, label: 'Forms $& more' }, { ...deps(), groupToggle: true });

    expect(group.querySelector('.pagetree-facets__group-toggle').getAttribute('aria-label')).toBe('Select all Forms $& more');
  });

  it('selects the whole group, then clears it, and lets the modal know', () => {
    const { group, toggle, options } = mount();
    const changes = vi.fn();
    group.addEventListener('change', changes);

    toggle.click();
    expect(options.map((option) => option.checked)).toEqual([true, true, true]);
    expect(toggle.checked).toBe(true);

    toggle.click();
    expect(options.map((option) => option.checked)).toEqual([false, false, false]);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('reflects the group: checked for all, indeterminate for some, clear for none', () => {
    const { group, toggle, options } = mount({ ce: ['menu_pages'] });
    syncGroupToggle(group);
    expect(toggle.indeterminate).toBe(true);
    expect(toggle.checked).toBe(false);

    options.forEach((option) => { option.checked = true; });
    syncGroupToggle(group);
    expect(toggle.indeterminate).toBe(false);
    expect(toggle.checked).toBe(true);

    options.forEach((option) => { option.checked = false; });
    syncGroupToggle(group);
    expect(toggle.indeterminate).toBe(false);
    expect(toggle.checked).toBe(false);
  });

  it('selects everything from a partly selected group', () => {
    const { toggle, options } = mount({ ce: ['menu_pages'] });

    toggle.click();

    expect(options.map((option) => option.checked)).toEqual([true, true, true]);
  });

  it('follows the options as they are ticked one by one', () => {
    const { toggle, options } = mount();

    options[0].click();
    expect(toggle.indeterminate).toBe(true);
    options[1].click();
    options[2].click();
    expect(toggle.checked).toBe(true);
    expect(toggle.indeterminate).toBe(false);
  });
});

describe('clearControl', () => {
  it('deselects every option of a select', () => {
    const select = render({ name: 'table', type: 'select', options: [{ value: 'a', label: 'A' }] }, { table: ['a'] }).querySelector('select');

    clearControl(select);

    expect(select.selectedOptions).toHaveLength(0);
  });

  it('unchecks a radio that has no neutral option to fall back to', () => {
    const input = document.createElement('input');
    input.type = 'radio';
    input.checked = true;

    clearControl(input);

    expect(input.checked).toBe(false);
  });

  it('drops the wire value of a picker along with its text', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'Editor';
    input.dataset.picker = '';
    input.dataset.value = '5';
    input.dataset.label = 'Editor';

    clearControl(input);

    expect(input.value).toBe('');
    expect(input.dataset.value).toBeUndefined();
    expect(input.dataset.label).toBeUndefined();
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
