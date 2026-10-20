import { beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from '@typo3/backend/modal.js';
import FacetsModal from '@konradmichalik/pagetree-facets/facets-modal.js';
import { respondWith } from './Stubs/typo3/core/ajax/ajax-request.js';
import {
  applyButton,
  chipLabels,
  configurationFixture,
  control,
  knownUser,
  lastModal,
  navItem,
  openModal,
  openedModals,
  panel,
  resetHarness,
  scopeChip,
  scopeOptions,
  scopeValue,
  textSwitch,
  type,
} from './Support/modal-harness.js';

/*
 * facets-modal.js, part one: what a freshly opened modal looks like for a given
 * configuration - navigation, panels, scope controls and the active-filter chips
 * derived from the hydrated state.
 *
 * The modal talks to core through Modal/Notification and to the server through
 * four AJAX endpoints; all of those are stubs (see Tests/JavaScript/Stubs and the
 * harness), so every test here is about the modal's own decisions. What it cannot
 * decide - whether core's modal really routes every close through a cancelable
 * event, and anything involving layout or real focus order - stays with
 * Tests/Playwright, as the vitest config explains.
 */

const favoritesItem = (modal) => navItem(modal, '__favorites').closest('li');

beforeEach(() => {
  resetHarness();
});

describe('opening', () => {
  it('opens no modal at all when every tab is disabled away', async () => {
    // FacetRegistry can disable every tab (extension configuration, User TSconfig),
    // and a modal with no criteria to offer is worse than none.
    const { modal } = await openModal({ configuration: configurationFixture({ tabs: [] }) });

    expect(modal).toBeNull();
    expect(openedModals()).toEqual([]);
  });

  it('treats no phrase at all the same as an empty one', async () => {
    respondWith((payload) => {
      expect(payload.phrase).toBe('');

      return configurationFixture();
    });

    await expect(FacetsModal.open(undefined, 5, vi.fn())).resolves.toBeUndefined();
  });

  it('hydrates the phrase server-side and starts on the first usable tab', async () => {
    const { modal } = await openModal();

    expect(navItem(modal, 'doktype').classList.contains('active')).toBe(true);
    expect(navItem(modal, 'doktype').getAttribute('aria-current')).toBe('true');
    expect(panel(modal, 'doktype').hidden).toBe(false);
    expect(panel(modal, 'state').hidden).toBe(true);
  });

  it('skips an unusable tab when picking the initial one', async () => {
    const configuration = configurationFixture();
    // Translations first: it has a field, but no options to pick from.
    configuration.tabs.unshift(configuration.tabs.splice(2, 1)[0]);

    const { modal } = await openModal({ configuration });

    expect(navItem(modal, 'translations').classList.contains('active')).toBe(false);
    expect(navItem(modal, 'doktype').classList.contains('active')).toBe(true);
  });

  it('renders each group heading once, in first-seen order', async () => {
    const { modal } = await openModal();

    // doktype and state share "Content"; translations and activity are ungrouped.
    expect([...modal.querySelectorAll('.pagetree-facets__nav-group')].map((heading) => heading.textContent))
      .toEqual(['Content']);
  });

  it('disables a tab whose every choice field is optionless and says why on a second line', async () => {
    const configuration = configurationFixture();
    configuration.tabs[2].configuration.emptyReason = 'Site has only one language';

    const { modal } = await openModal({ configuration });
    const item = navItem(modal, 'translations');

    expect(item.disabled).toBe(true);
    expect(item.classList.contains('is-empty')).toBe(true);
    // In the item itself, never only in a tooltip.
    expect(item.querySelector('.pagetree-facets__nav-reason').textContent).toBe('Site has only one language');
    expect(item.title).toBe('');
  });

  it('falls back to the generic reason for a facet that gives none', async () => {
    const { modal } = await openModal();

    expect(navItem(modal, 'translations').querySelector('.pagetree-facets__nav-reason').textContent).toBe('No options available');
    expect(navItem(modal, 'doktype').querySelector('.pagetree-facets__nav-reason')).toBeNull();
  });

  it('keeps a tab usable when it has a freeform field, options or not', async () => {
    // Activity is nothing but text inputs - always usable.
    const { modal } = await openModal();

    expect(navItem(modal, 'activity').disabled).toBe(false);
  });

  it('disables a tab that describes no fields at all', async () => {
    const configuration = configurationFixture();
    configuration.tabs.push({
      identifier: 'example', label: 'Example', state: {}, configuration: { fields: [] },
    });

    const { modal } = await openModal({ configuration });

    expect(navItem(modal, 'example').disabled).toBe(true);
  });

  it('tolerates a tab configuration without a fields list at all, same as an empty one', async () => {
    const configuration = configurationFixture();
    configuration.tabs.push({ identifier: 'example', label: 'Example', state: {}, configuration: {} });

    const { modal } = await openModal({ configuration });

    expect(navItem(modal, 'example').disabled).toBe(true);
    // The heading is always there, the fields are not.
    expect(panel(modal, 'example').querySelector('.pagetree-facets__panel-fields').children).toHaveLength(0);
  });

  it('treats a choice field without an options list as optionless, not as a crash', async () => {
    const configuration = configurationFixture();
    configuration.tabs.push({
      identifier: 'example',
      label: 'Example',
      state: {},
      configuration: { fields: [{ type: 'checkbox-group', name: 'flag', label: 'Flag' }] },
    });

    const { modal } = await openModal({ configuration });

    expect(navItem(modal, 'example').disabled).toBe(true);
  });

  it('falls back to the first tab when every one of them is unusable', async () => {
    const allEmpty = configurationFixture({
      tabs: [
        {
          identifier: 'doktype',
          label: 'Page type',
          state: {},
          configuration: { fields: [{ type: 'checkbox-group', name: 'doktype', label: 'Page type', options: [] }] },
        },
        {
          identifier: 'state',
          label: 'Page state',
          state: {},
          configuration: { fields: [{ type: 'checkbox-group', name: 'is', label: 'State', options: [] }] },
        },
      ],
    });

    const { modal } = await openModal({ configuration: allEmpty });

    expect(navItem(modal, 'doktype').classList.contains('active')).toBe(true);
    // Neither tab offers a stop for the roving tabindex, so arrowing through the
    // nav must not throw trying to focus a non-existent item.
    expect(() => navItem(modal, 'doktype')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))).not.toThrow();
  });

  it('renders without a sites list at all, same as an empty one', async () => {
    const { modal } = await openModal({ configuration: configurationFixture({ sites: undefined }) });

    expect(scopeOptions(modal)).toEqual(['Whole tree', 'Below "Home" [5]']);
  });

  it('starts the freetext field empty when the configuration carries none', async () => {
    const { modal } = await openModal({ configuration: configurationFixture({ freetext: undefined }) });

    expect(modal.querySelector('[data-role="freetext"]').value).toBe('');
  });

  it('renders with no favorites property at all, same as an empty list', async () => {
    // openModal()'s own stub always merges a `favorites` array into whatever
    // the fixture returns, so this goes straight through respondWith() to
    // prove the server response itself may omit the key.
    respondWith(() => {
      const configuration = configurationFixture();
      delete configuration.favorites;

      return configuration;
    });

    await FacetsModal.open('', 5, vi.fn());
    const modal = lastModal().element;

    expect(favoritesItem(modal).hidden).toBe(true);
    expect(modal.querySelector('.pagetree-facets__favorites-list').children).toHaveLength(0);
  });

  it('opens once when clicked again while the configuration is still in flight', async () => {
    // The bug this covers: on a slow instance the request outlasts the user's
    // patience, the second click gets past open() and builds its own modal.
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const opening = openModal({ configuration: () => pending });
    const second = FacetsModal.open('', 5, vi.fn());
    release(configurationFixture());
    await Promise.all([opening, second]);

    expect(openedModals()).toHaveLength(1);
  });

  it('opens again once the modal was closed', async () => {
    const { modal } = await openModal();
    modal.hideModal();

    await openModal();

    expect(openedModals()).toHaveLength(2);
  });

  it('stays openable when building the modal throws after the configuration arrived', async () => {
    // The guard is only released by the 'typo3-modal-hidden' listener, which is
    // registered last - so everything before it has to be inside the reset.
    const advanced = vi.spyOn(Modal, 'advanced').mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(openModal()).rejects.toThrow('boom');
    advanced.mockRestore();

    const { modal } = await openModal();

    expect(modal).not.toBeNull();
  });

  it('stays openable after a failed configuration request', async () => {
    respondWith(() => { throw new Error('boom'); });
    await expect(FacetsModal.open('', 5, vi.fn())).rejects.toThrow('boom');

    const { modal } = await openModal();

    expect(modal).not.toBeNull();
  });
});

describe('the scope chip', () => {
  it('lists the sites only when there is more than one', async () => {
    const { modal } = await openModal({
      configuration: configurationFixture({ sites: [{ identifier: 'main' }] }),
    });

    expect(scopeOptions(modal)).toEqual(['Whole tree', 'Below "Home" [5]']);
  });

  it('reads the site the phrase already scopes to', async () => {
    const { modal } = await openModal({
      configuration: configurationFixture({ activeSite: 'other' }),
    });

    expect(scopeValue(modal)).toBe('other');
  });

  it('offers no page entry where there is no page to scope to', async () => {
    const { modal } = await openModal({ pageId: null });

    expect(scopeOptions(modal)).toEqual(['Whole tree', 'main', 'other']);
  });

  it('is not rendered at all without a page and with a single site', async () => {
    const { modal } = await openModal({
      pageId: null,
      configuration: configurationFixture({ sites: [{ identifier: 'main' }] }),
    });

    expect(scopeChip(modal)).toBeNull();
  });

  it('reads the open page when the phrase carries an under: token', async () => {
    const { modal } = await openModal({
      configuration: configurationFixture({ pageScope: 5 }),
    });

    expect(scopeValue(modal)).toBe('Below "Home" [5]');
  });

  it('leads the criteria row, ahead of the chips', async () => {
    const { modal } = await openModal();

    expect(modal.querySelector('.pagetree-facets__criteria').firstElementChild.className).toBe('pagetree-facets__scope');
  });

  it('builds the Text switch into the search field, which holds nothing else', async () => {
    const { modal } = await openModal();
    const field = modal.querySelector('.pagetree-facets__search-field');

    // Both fields share the box because they take turns - the switch sits
    // against whichever one is on screen.
    expect([...field.children].map((child) => child.className.split(' ').at(-1)))
      .toEqual(['pagetree-facets__search-icon', 'pagetree-facets__freetext', 'pagetree-facets__token-field', 'pagetree-facets__text-switch']);
    // Help lives in the navigation now, nothing sits beside the field.
    expect(modal.querySelector('.pagetree-facets__search').children).toHaveLength(1);
    expect(modal.querySelector('.pagetree-facets__help-toggle')).toBeNull();
  });

  it('pins the help link under the navigation list, outside the facet items', async () => {
    const { modal } = await openModal();
    const nav = modal.querySelector('.pagetree-facets__nav');
    const link = nav.querySelector('.pagetree-facets__help-link');

    expect(nav.lastElementChild.contains(link)).toBe(true);
    expect(link.closest('.pagetree-facets__nav-list')).toBeNull();
    expect(link.classList.contains('pagetree-facets__nav-item')).toBe(false);
    // The popover lives in the content, over the panels, not inside the nav.
    const popover = modal.querySelector('.pagetree-facets__help');
    expect(popover.parentElement.classList.contains('pagetree-facets')).toBe(true);
    expect(popover.hidden).toBe(true);
  });

  it('explains every action on hover rather than repeating its label', async () => {
    // Titles carry the consequence ("what happens if I press this"), which a
    // three-word label cannot. Icon-only controls keep their short aria-label
    // as the announced name, so the two never collide.
    const { modal } = await openModal();
    const titleOf = (selector) => modal.querySelector(selector).title;

    expect(titleOf('.pagetree-facets__text-switch')).toBe('Shows the whole filter as editable text.');
    expect(titleOf('.pagetree-facets__help-link')).toBe('Explains how criteria combine and what each action does.');
    // Not icon-only: the word is the name, so no aria-label has to repeat it.
    expect(textSwitch(modal).textContent.trim()).toBe('Text');
    expect(textSwitch(modal).hasAttribute('aria-label')).toBe(false);
  });

  it('names the criterion a chip\'s × would drop, there being several in a row', async () => {
    const { modal } = await openModal();
    const remove = modal.querySelector('.pagetree-facets__chip-remove');

    expect(remove.title).toBe('Remove Page state: Hidden');
    expect(remove.getAttribute('aria-label')).toBe(remove.title);
  });

  it('prefills freetext from the hydrated phrase', async () => {
    const { modal } = await openModal({
      configuration: configurationFixture({ freetext: 'contact' }),
    });

    expect(modal.querySelector('[data-role="freetext"]').value).toBe('contact');
  });
});

describe('the active-filter chips', () => {
  it('mirror the hydrated selection and count it per tab', async () => {
    const { modal } = await openModal();

    expect(chipLabels(modal)).toEqual(['Page state: Hidden']);
    expect(navItem(modal, 'state').querySelector('.pagetree-facets__nav-count').textContent).toBe('1');
    expect(navItem(modal, 'doktype').querySelector('.pagetree-facets__nav-count')).toBeNull();
  });

  it('give way to the fixed empty state while nothing is selected', async () => {
    const configuration = configurationFixture();
    configuration.tabs[1].state = {};

    const { modal } = await openModal({ configuration });

    expect(modal.querySelector('.pagetree-facets__criteria').classList.contains('is-empty')).toBe(true);
    expect(modal.querySelector('.pagetree-facets__criteria-empty').hidden).toBe(false);
    expect(modal.querySelector('.pagetree-facets__criteria-actions').hidden).toBe(true);
    // The scope chip stays in that state.
    expect(scopeChip(modal)).not.toBeNull();
  });

  it('lead with the page title as a chip of its own, which empties the field when removed', async () => {
    const { modal } = await openModal({ configuration: configurationFixture({ freetext: 'home' }) });
    expect(chipLabels(modal)).toEqual(['Title: home', 'Page state: Hidden']);
    // Not a facet, so no navigation item counts it.
    expect(modal.querySelectorAll('.pagetree-facets__nav-count')).toHaveLength(1);

    modal.querySelector('.pagetree-facets__chip-remove').click();

    expect(modal.querySelector('[data-role="freetext"]').value).toBe('');
    expect(modal.querySelector('.pagetree-facets__clear').hidden).toBe(true);
    expect(chipLabels(modal)).toEqual(['Page state: Hidden']);
    expect(applyButton(modal).disabled).toBe(false);
  });

  it('move focus to the scope chip once the last chip was removed from the keyboard', async () => {
    const { modal } = await openModal();
    const remove = modal.querySelector('.pagetree-facets__chip-remove');
    remove.focus();

    remove.click();

    expect(document.activeElement).toBe(scopeChip(modal));
  });

  it('move focus to the page-title field instead when there is no scope chip', async () => {
    const { modal } = await openModal({ pageId: null, configuration: configurationFixture({ sites: [{ identifier: 'main' }] }) });
    const remove = modal.querySelector('.pagetree-facets__chip-remove');
    remove.focus();

    remove.click();

    expect(scopeChip(modal)).toBeNull();
    expect(document.activeElement).toBe(modal.querySelector('[data-role="freetext"]'));
  });

  it('grow a title chip while typing, trimmed, and drop it for blank input', async () => {
    const { modal } = await openModal();

    type(modal.querySelector('[data-role="freetext"]'), '  contact ');
    await expect.poll(() => chipLabels(modal)).toEqual(['Title: contact', 'Page state: Hidden']);

    type(modal.querySelector('[data-role="freetext"]'), '   ');
    await expect.poll(() => chipLabels(modal)).toEqual(['Page state: Hidden']);
  });

  it('appear for a newly ticked option, with the tab label as prefix', async () => {
    const { modal } = await openModal();

    control(modal, 'doktype[doktype]', '1').click();

    expect(chipLabels(modal)).toContain('Page type: Standard');
  });

  it('name the field, not the tab, once a tab has several distinct criteria', async () => {
    // Activity has "Last updated" and "Created" - the tab label alone would not
    // say which of them a chip stands for.
    const { modal } = await openModal();

    type(control(modal, 'activity[changed]'), '7d');

    await expect.poll(() => chipLabels(modal)).toContain('Last updated: 7d');
  });

  it('falls back to the checkbox\'s own value when its label carries no dedicated option-label span', async () => {
    // renderField() always wraps the label text in that span, but a
    // third-party facet's own markup is not obliged to - the chip must not
    // silently disappear just because the span is missing.
    const { modal } = await openModal();
    const empty = control(modal, 'state[is]', 'empty');
    empty.closest('label').querySelector('.pagetree-facets__option-label').remove();

    empty.click();

    expect(chipLabels(modal)).toContain('Page state: empty');
  });

  it('never leak an option description into the chip', async () => {
    // The description is a visually-hidden span inside the same <label>.
    const { modal } = await openModal();

    control(modal, 'state[is]', 'empty').click();

    expect(chipLabels(modal)).toContain('Page state: Empty');
  });

  it('deselect their own control when removed', async () => {
    const { modal } = await openModal();
    const hidden = control(modal, 'state[is]', 'hidden');

    modal.querySelector('.pagetree-facets__chip-remove').click();

    expect(hidden.checked).toBe(false);
    expect(chipLabels(modal)).toEqual([]);
  });

  it('empty a text criterion when its chip is removed', async () => {
    const { modal } = await openModal();
    const input = control(modal, 'activity[changed]');
    type(input, '7d');
    await expect.poll(() => chipLabels(modal)).toContain('Last updated: 7d');

    [...modal.querySelectorAll('.pagetree-facets__chip')]
      .find((chip) => chip.textContent.includes('7d'))
      .querySelector('.pagetree-facets__chip-remove')
      .click();

    expect(input.value).toBe('');
    expect(chipLabels(modal)).toEqual(['Page state: Hidden']);
  });

  it('builds a chip from a selected option in a select field, bucketed by source', async () => {
    // Mirrors RecordsTab's real shape: several same-named `table` fields, one
    // per source, so the tab label (not either field's own label) prefixes the
    // chip - and a <select> control's own selectedOptions is the source, unlike
    // a checkbox's checked state.
    const configuration = configurationFixture({
      tabs: [{
        identifier: 'records',
        label: 'Records',
        state: {},
        configuration: {
          fields: [
            {
              type: 'select',
              name: 'table',
              label: 'TYPO3 Core',
              options: [{ value: 'tt_content', label: 'Content' }, { value: '123', label: '' }],
            },
            { type: 'select', name: 'table', label: 'News', options: [{ value: 'tx_news', label: 'News' }] },
          ],
        },
      }],
    });
    const { modal } = await openModal({ configuration });
    const [firstSelect] = modal.querySelectorAll('select[name="records[table]"]');
    // The second option has no label at all - falls back to its raw value,
    // same as an unlabelled checkbox option would.
    firstSelect.options[1].selected = true;

    firstSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(chipLabels(modal)).toEqual(['Records: 123']);

    modal.querySelector('.pagetree-facets__chip-remove').click();

    expect(firstSelect.options[1].selected).toBe(false);
    expect(chipLabels(modal)).toEqual([]);
  });

  it('reveal the filter-wide actions as soon as anything is savable', async () => {
    const configuration = configurationFixture();
    configuration.tabs[1].state = {};
    const { modal } = await openModal({ configuration });
    expect(modal.querySelector('.pagetree-facets__criteria-actions').hidden).toBe(true);

    // Freetext alone counts - the actions act on the whole phrase, not on chips.
    type(modal.querySelector('[data-role="freetext"]'), 'contact');

    await expect.poll(() => modal.querySelector('.pagetree-facets__criteria-actions').hidden).toBe(false);
  });
});

describe('a user-picker criterion', () => {
  // The one field type whose visible value is a display label rather than the
  // value that gets serialized - `dataset.value` is the source of truth, and both
  // of the modal's generic collectors have to honour that.
  const withPicker = (state) => {
    const configuration = configurationFixture();
    const activity = configuration.tabs.find((tab) => 'activity' === tab.identifier);
    activity.configuration.fields.push({
      type: 'user-picker',
      name: 'editedBy',
      label: 'Edited by',
      currentUser: { uid: 1, username: 'admin' },
    });
    activity.state = undefined === state ? {} : { editedBy: state };

    return configuration;
  };

  it('serializes the picked value while the chip shows its label', async () => {
    const { modal, onApply } = await openModal({ configuration: withPicker(['me']) });

    expect(control(modal, 'activity[editedBy]').value).toBe('Me (admin)');
    expect(chipLabels(modal)).toContain('Edited by: Me (admin)');

    control(modal, 'doktype[doktype]', '1').click();
    applyButton(modal).click();

    await expect.poll(() => onApply.mock.calls).toEqual([['doktype:1 is:hidden editedBy:me']]);
  });

  it('resolves a bare uid into a label and refreshes the chips once it arrives', async () => {
    const { modal } = await openModal({ configuration: withPicker([String(knownUser.uid)]) });

    await expect.poll(() => chipLabels(modal)).toContain(`Edited by: ${knownUser.label}`);
  });

  it('reparents its dropdown against the modal root the panel hands it', async () => {
    // Proves the real getRoot() wired up in #renderPanel(), not the isolated
    // deps stub Filter/user-picker.test.js uses for its own unit coverage.
    const { modal } = await openModal({ configuration: withPicker() });

    control(modal, 'activity[editedBy]').dispatchEvent(new Event('focus'));

    expect(modal.querySelector('.pagetree-facets__user-results').parentElement)
      .toBe(modal.querySelector('.pagetree-facets'));
  });

  it('never counts mid-typing text as a criterion', async () => {
    const { modal } = await openModal({ configuration: withPicker() });

    type(control(modal, 'activity[editedBy]'), 'edi');

    // Past the indicator debounce: a query without a pick stays no criterion.
    await new Promise((resolve) => { setTimeout(resolve, 150); });
    expect(chipLabels(modal)).toEqual(['Page state: Hidden']);
  });
});
