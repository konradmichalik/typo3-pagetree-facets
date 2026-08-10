import { beforeEach, describe, expect, it, vi } from 'vitest';
import FacetsModal from '@konradmichalik/pagetree-facets/facets-modal.js';
import { respondWith } from './Stubs/typo3/core/ajax/ajax-request.js';
import {
  applyButton,
  chipLabels,
  configurationFixture,
  control,
  knownUser,
  navItem,
  openModal,
  openedModals,
  panel,
  resetHarness,
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

  it('disables a tab whose every choice field is optionless', async () => {
    const { modal } = await openModal();
    const item = navItem(modal, 'translations');

    expect(item.disabled).toBe(true);
    expect(item.classList.contains('is-empty')).toBe(true);
    expect(item.title).toBe('No options available');
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

  it('stays openable after a failed configuration request', async () => {
    respondWith(() => { throw new Error('boom'); });
    await expect(FacetsModal.open('', 5, vi.fn())).rejects.toThrow('boom');

    const { modal } = await openModal();

    expect(modal).not.toBeNull();
  });
});

describe('the scope controls', () => {
  it('offers the site dropdown only when there is more than one site', async () => {
    const { modal } = await openModal({
      configuration: configurationFixture({ sites: [{ identifier: 'main' }] }),
    });

    expect(modal.querySelector('[data-role="site-scope"]')).toBeNull();
  });

  it('preselects the site the phrase already scopes to', async () => {
    const { modal } = await openModal({
      configuration: configurationFixture({ activeSite: 'other' }),
    });

    expect(modal.querySelector('[data-role="site-scope"]').value).toBe('other');
  });

  it('omits the page scope where there is no page to scope to', async () => {
    const { modal } = await openModal({ pageId: null });

    expect(modal.querySelector('[data-role="page-scope"]')).toBeNull();
  });

  it('checks the page scope when the phrase carries an under: token', async () => {
    const { modal } = await openModal({
      configuration: configurationFixture({ pageScope: 5 }),
    });

    expect(modal.querySelector('[data-role="page-scope"]').checked).toBe(true);
  });

  it('glues the token toggle to the two fields it switches between', async () => {
    const { modal } = await openModal();
    const group = modal.querySelector('.pagetree-facets__search-group');

    // Both fields belong to the group because they take turns - the button has
    // to sit against whichever one is on screen.
    expect([...group.children].map((child) => child.className.split(' ').at(-1)))
      .toEqual(['pagetree-facets__freetext', 'pagetree-facets__token-field', 'pagetree-facets__token-toggle']);
    // Help explains the dialog rather than switching how it is edited, so it
    // stays outside the group.
    expect(group.querySelector('.pagetree-facets__help-toggle')).toBeNull();
    expect(modal.querySelector('.pagetree-facets__search > .pagetree-facets__help-toggle')).not.toBeNull();
  });

  it('explains every action on hover rather than repeating its label', async () => {
    // Titles carry the consequence ("what happens if I press this"), which a
    // three-word label cannot. Icon-only controls keep their short aria-label
    // as the announced name, so the two never collide.
    const { modal } = await openModal();
    const titleOf = (selector) => modal.querySelector(selector).title;

    expect(titleOf('.pagetree-facets__copy-link')).toBe('Copies a link to this view with the current filter attached.');
    expect(titleOf('.pagetree-facets__reset'))
      .toBe('Removes every criterion here. The page tree keeps its current filter until you apply.');
    expect(titleOf('.pagetree-facets__favorite-add'))
      .toBe('Saves the current filter under a name so you can reuse it later.');
    expect(titleOf('.pagetree-facets__token-toggle')).toBe('Shows the whole filter as editable text.');
    expect(titleOf('.pagetree-facets__help-toggle')).toBe('Explains how criteria combine and what each action does.');
    expect(modal.querySelector('.pagetree-facets__token-toggle').getAttribute('aria-label')).toBe('Token view');
  });

  it('names the criterion a chip\'s × would drop, there being several in a row', async () => {
    const { modal } = await openModal();
    const remove = modal.querySelector('.pagetree-facets__chip-remove');

    expect(remove.title).toBe('Page state: Hidden – remove filter');
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

  it('show the usage hint instead while nothing is selected', async () => {
    const configuration = configurationFixture();
    configuration.tabs[1].state = {};

    const { modal } = await openModal({ configuration });

    expect(modal.querySelector('.pagetree-facets__chips').hidden).toBe(true);
    expect(modal.querySelector('.pagetree-facets__hint').hidden).toBe(false);
    expect(modal.querySelector('.pagetree-facets__actions').hidden).toBe(true);
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

  it('reveal the filter-wide actions as soon as anything is savable', async () => {
    const configuration = configurationFixture();
    configuration.tabs[1].state = {};
    const { modal } = await openModal({ configuration });
    expect(modal.querySelector('.pagetree-facets__actions').hidden).toBe(true);

    // Freetext alone counts - the actions act on the whole phrase, not on chips.
    type(modal.querySelector('[data-role="freetext"]'), 'contact');

    await expect.poll(() => modal.querySelector('.pagetree-facets__actions').hidden).toBe(false);
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

  it('never counts mid-typing text as a criterion', async () => {
    const { modal } = await openModal({ configuration: withPicker() });

    type(control(modal, 'activity[editedBy]'), 'edi');

    // Past the indicator debounce: a query without a pick stays no criterion.
    await new Promise((resolve) => { setTimeout(resolve, 150); });
    expect(chipLabels(modal)).toEqual(['Page state: Hidden']);
  });
});
