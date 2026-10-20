import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPanel, buildPanelHeading, refreshPanel } from '@konradmichalik/pagetree-facets/Filter/panel.js';

/*
 * One facet's panel: the heading with the facet name, its description and
 * Select none, then the fields. The modal only tells it when something changed.
 */

const deps = () => ({ getRoot: () => document.body, onLabelResolved: vi.fn() });

const options = (count) => Array.from({ length: count }, (_, index) => ({ value: String(index + 1), label: `Option ${index + 1}` }));

const tab = (overrides = {}) => ({
  identifier: 'doktype',
  label: 'Page type',
  state: {},
  configuration: {
    description: 'Show pages of the selected types.',
    fields: [{ type: 'checkbox-group', name: 'doktype', label: 'Page type', options: options(3) }],
  },
  ...overrides,
});

const mount = (tabConfiguration, onChange = vi.fn()) => {
  const panel = buildPanel(tabConfiguration, { fieldDeps: deps(), onChange });
  document.body.replaceChildren(panel);

  return { panel, onChange };
};

const selectNone = (panel) => panel.querySelector('.pagetree-facets__select-none');
const count = (panel) => panel.querySelector('.pagetree-facets__panel-count');

beforeEach(() => {
  globalThis.TYPO3 = { lang: {}, settings: { ajaxUrls: {} } };
});

describe('the heading', () => {
  it('names the facet and says what it matches', () => {
    const { panel } = mount(tab());

    expect(panel.querySelector('h2').textContent).toBe('Page type');
    expect(panel.querySelector('.pagetree-facets__panel-description').textContent).toBe('Show pages of the selected types.');
  });

  it('renders the heading only for a facet without a description', () => {
    const configuration = tab();
    delete configuration.configuration.description;

    const { panel } = mount(configuration);

    expect(panel.querySelector('h2').textContent).toBe('Page type');
    expect(panel.querySelector('.pagetree-facets__panel-description').hidden).toBe(true);
  });

  it('hides a legend that only repeats the facet name, keeping it for assistive technology', () => {
    const { panel } = mount(tab());

    expect(panel.querySelector('legend').classList.contains('visually-hidden')).toBe(true);
  });

  it('keeps a legend that says more than the facet name', () => {
    const configuration = tab();
    configuration.configuration.fields[0].label = 'Backend layout';

    const { panel } = mount(configuration);

    expect(panel.querySelector('legend').classList.contains('visually-hidden')).toBe(false);
  });

  it('can stand alone, for the panel the modal owns itself', () => {
    const heading = buildPanelHeading({ label: 'Favorites' });

    expect(heading.querySelector('h2').textContent).toBe('Favorites');
    expect(heading.querySelector('.pagetree-facets__select-none')).toBeNull();
  });
});

describe('Select none', () => {
  it('appears once something in this panel is picked', () => {
    const { panel } = mount(tab());
    expect(selectNone(panel).hidden).toBe(true);

    panel.querySelector('input[value="2"]').checked = true;
    refreshPanel(panel);

    expect(selectNone(panel).hidden).toBe(false);
  });

  it('is named and explains itself', () => {
    const { panel } = mount(tab());

    expect(selectNone(panel).textContent).toBe('Select none');
    expect(selectNone(panel).title).toBe('Clears every criterion of this category.');
  });

  it('clears only this panel and reports the change', () => {
    const configuration = tab({
      state: { doktype: ['1'], updated: '<7d', note: 'typed', by: 'me' },
      configuration: {
        fields: [
          { type: 'checkbox-group', name: 'doktype', label: 'Page type', options: options(3) },
          { type: 'radio-presets', name: 'updated', label: 'Updated', options: [{ value: '<7d', label: 'Last week' }] },
          { type: 'text', name: 'note', label: 'Note' },
          { type: 'user-picker', name: 'by', label: 'Edited by', currentUser: { uid: 1, username: 'admin' } },
        ],
      },
    });
    const { panel, onChange } = mount(configuration);
    const other = document.createElement('input');
    other.type = 'checkbox';
    other.name = 'state[is]';
    other.checked = true;
    document.body.append(other);
    refreshPanel(panel);

    selectNone(panel).click();

    expect(panel.querySelector('input[value="1"]').checked).toBe(false);
    // Radios fall back to the neutral option rather than to no option at all.
    expect(panel.querySelector('input[name="doktype[updated]"][value=""]').checked).toBe(true);
    expect(panel.querySelector('input[name="doktype[note]"]').value).toBe('');
    expect(panel.querySelector('input[name="doktype[by]"]').dataset.value).toBeUndefined();
    expect(other.checked).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(selectNone(panel).hidden).toBe(true);
  });

  it('moves focus to the first control before it hides itself', () => {
    const { panel } = mount(tab());
    panel.querySelector('input[value="2"]').checked = true;
    refreshPanel(panel);
    selectNone(panel).focus();

    selectNone(panel).click();

    expect(selectNone(panel).hidden).toBe(true);
    expect(document.activeElement).toBe(panel.querySelector('input[value="1"]'));
  });

  it('leaves focus alone when it hides without having it', () => {
    const { panel } = mount(tab());
    panel.querySelector('input[value="2"]').checked = true;
    refreshPanel(panel);
    const other = document.createElement('button');
    other.type = 'button';
    document.body.append(other);
    other.focus();

    selectNone(panel).click();

    expect(document.activeElement).toBe(other);
  });

  it('counts neither the neutral radio nor an untouched picker as something picked', () => {
    const configuration = tab({
      configuration: {
        fields: [
          { type: 'radio-presets', name: 'updated', label: 'Updated', options: [{ value: '<7d', label: 'Last week' }] },
          { type: 'user-picker', name: 'by', label: 'Edited by', currentUser: { uid: 1, username: 'admin' } },
        ],
      },
    });
    const { panel } = mount(configuration);
    refreshPanel(panel);

    expect(selectNone(panel).hidden).toBe(true);
  });
});

describe('a large panel', () => {
  const large = (fields) => tab({ configuration: { description: 'Many.', fields } });

  it('switches to dense rows above 15 options in one field', () => {
    expect(mount(large([{ type: 'checkbox-group', name: 'ce', label: 'A', options: options(16) }])).panel.classList.contains('is-dense')).toBe(true);
    expect(mount(large([{ type: 'checkbox-group', name: 'ce', label: 'A', options: options(15) }])).panel.classList.contains('is-dense')).toBe(false);
  });

  it('counts the fields of one criterion together, since they are one list split by group', () => {
    const fields = [
      { type: 'checkbox-group', name: 'ce', label: 'Typical', options: options(8) },
      { type: 'checkbox-group', name: 'ce', label: 'Menu', options: options(8) },
    ];

    expect(mount(large(fields)).panel.classList.contains('is-dense')).toBe(true);
  });

  it('does not add up fields of different criteria', () => {
    const fields = [
      { type: 'checkbox-group', name: 'untranslated', label: 'Missing in', options: options(8) },
      { type: 'checkbox-group', name: 'translated', label: 'Exists in', options: options(8) },
    ];

    expect(mount(large(fields)).panel.classList.contains('is-dense')).toBe(false);
  });

  it('shows how many of all options are selected, after the description', () => {
    const { panel } = mount(large([{ type: 'checkbox-group', name: 'ce', label: 'A', options: options(20) }]));
    panel.querySelector('input[value="3"]').checked = true;
    panel.querySelector('input[value="7"]').checked = true;
    refreshPanel(panel);

    expect(count(panel).hidden).toBe(false);
    expect(count(panel).textContent).toBe(' 2 of 20 selected.');
    expect(panel.querySelector('.pagetree-facets__panel-description').textContent).toBe('Many. 2 of 20 selected.');
  });

  it('counts the options of a select field, as a third-party facet may use one', () => {
    const configuration = tab({
      state: { ce: ['3', '7'] },
      configuration: { description: 'Many.', fields: [{ type: 'select', name: 'ce', label: 'A', options: options(16) }] },
    });
    const { panel } = mount(configuration);
    refreshPanel(panel);

    expect(panel.classList.contains('is-dense')).toBe(true);
    expect(count(panel).textContent).toBe(' 2 of 16 selected.');
  });

  it('counts neither the neutral radio nor a text field as an option', () => {
    const configuration = tab({
      state: { ce: ['3'], updated: '<7d', note: 'typed' },
      configuration: {
        description: 'Many.',
        fields: [
          { type: 'checkbox-group', name: 'ce', label: 'A', options: options(16) },
          { type: 'radio-presets', name: 'updated', label: 'Updated', options: [{ value: '<7d', label: 'Last week' }, { value: '<30d', label: 'Last month' }] },
          { type: 'text', name: 'note', label: 'Note' },
        ],
      },
    });
    const { panel } = mount(configuration);
    refreshPanel(panel);

    expect(count(panel).textContent).toBe(' 2 of 18 selected.');
  });

  it('shows the count alone when the facet has no description', () => {
    const configuration = tab({ configuration: { fields: [{ type: 'checkbox-group', name: 'ce', label: 'A', options: options(20) }] } });
    const { panel } = mount(configuration);
    refreshPanel(panel);

    const sentence = panel.querySelector('.pagetree-facets__panel-description');
    expect(sentence.hidden).toBe(false);
    expect(sentence.textContent).toBe('0 of 20 selected.');
  });

  it('gives each group of a split criterion its own checkbox and keeps them in step', () => {
    const fields = [
      { type: 'checkbox-group', name: 'ce', label: 'Typical', options: options(8) },
      { type: 'checkbox-group', name: 'ce', label: 'Menu', options: options(8) },
      { type: 'checkbox-group', name: 'other', label: 'Other', options: options(2) },
    ];
    const { panel } = mount(large(fields));
    const toggles = [...panel.querySelectorAll('.pagetree-facets__group-toggle')];
    expect(toggles).toHaveLength(2);

    panel.querySelector('input[name="doktype[ce]"]').checked = true;
    refreshPanel(panel);
    expect(toggles[0].indeterminate).toBe(true);

    selectNone(panel).click();
    expect(toggles[0].indeterminate).toBe(false);
    expect(toggles[0].checked).toBe(false);
  });

  it('keeps the count out of a small panel', () => {
    const { panel } = mount(tab());
    refreshPanel(panel);

    expect(count(panel).hidden).toBe(true);
  });
});
