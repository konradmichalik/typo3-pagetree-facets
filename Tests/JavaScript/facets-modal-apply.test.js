import { beforeEach, describe, expect, it } from 'vitest';
import { SeverityEnum } from './Stubs/typo3/backend/enum/severity.js';
import {
  applyButton,
  chipLabels,
  configurationFixture,
  control,
  footerButton,
  lastModal,
  navItem,
  openModal,
  openedModals,
  panel,
  resetHarness,
  type,
} from './Support/modal-harness.js';

/*
 * facets-modal.js, part two: the paths that end in a phrase reaching the tree,
 * or deliberately not reaching it - the Apply button's dirty state, the close
 * guard, Reset - plus navigating between tabs.
 *
 * The close guard rests on core dispatching a cancelable typo3-modal-hide for
 * every close route (button, ESC, backdrop, X). The stub reproduces that shape,
 * so what is proven here is the modal's reaction to it; that core really behaves
 * that way is Playwright's job.
 */

const dirty = (modal) => control(modal, 'doktype[doktype]', '1').click();

beforeEach(() => {
  resetHarness();
});

describe('the Apply button', () => {
  it('starts disabled, since applying the phrase already in effect is a no-op', async () => {
    const { modal } = await openModal();

    expect(applyButton(modal).disabled).toBe(true);
    expect(modal.querySelector('.pagetree-facets__pending').hidden).toBe(true);
  });

  it('enables itself and announces the pending selection once something differs', async () => {
    const { modal } = await openModal();

    dirty(modal);

    expect(applyButton(modal).disabled).toBe(false);
    expect(modal.querySelector('.pagetree-facets__pending').hidden).toBe(false);
  });

  it('stays enabled after the last criterion is removed - the tree is still filtered', async () => {
    const { modal } = await openModal();

    modal.querySelector('.pagetree-facets__chip-remove').click();

    expect(chipLabels(modal)).toEqual([]);
    expect(applyButton(modal).disabled).toBe(false);
  });

  it('serializes the whole form and hands the phrase to the caller', async () => {
    const { modal, onApply } = await openModal();
    dirty(modal);
    type(modal.querySelector('[data-role="freetext"]'), 'contact');
    modal.querySelector('[data-role="site-scope"]').value = 'other';
    modal.querySelector('[data-role="page-scope"]').checked = true;

    applyButton(modal).click();

    // pageScope is the page open right now (5), never whatever a hydrated
    // under: token pointed at.
    await expect.poll(() => onApply.mock.calls).toEqual([['doktype:1 is:hidden site:other under:5 contact']]);
    expect(document.body.contains(modal)).toBe(false);
  });
});

describe('Enter inside the modal', () => {
  it('applies, so a typed criterion needs no reach for the mouse', async () => {
    const { modal, onApply } = await openModal();
    const freetext = modal.querySelector('[data-role="freetext"]');

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    freetext.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await expect.poll(() => onApply).toHaveBeenCalled();
  });

  it('is left alone on a button, where it is the activation key', async () => {
    const { modal, onApply } = await openModal();
    const help = modal.querySelector('.pagetree-facets__help-toggle');

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    help.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('closing with an unapplied selection', () => {
  it('closes straight away while nothing is pending', async () => {
    const { modal } = await openModal();

    footerButton(modal, 'Close').click();

    expect(document.body.contains(modal)).toBe(false);
    expect(openedModals()).toHaveLength(1);
  });

  it('is intercepted, and offers the three ways out', async () => {
    const { modal } = await openModal();
    dirty(modal);

    footerButton(modal, 'Close').click();

    expect(document.body.contains(modal)).toBe(true);
    const confirmation = lastModal();
    expect(confirmation.kind).toBe('confirm');
    // A warning, not an error: nothing went wrong, a choice is simply pending.
    expect(confirmation.severity).toBe(SeverityEnum.warning);
    expect([...confirmation.element.querySelectorAll('.t3js-modal-footer button')].map((b) => b.textContent))
      .toEqual(['Back', 'Discard', 'Apply & close']);
  });

  it('keeps the modal open on "Back"', async () => {
    const { modal } = await openModal();
    dirty(modal);
    footerButton(modal, 'Close').click();

    footerButton(lastModal().element, 'Back').click();

    expect(document.body.contains(modal)).toBe(true);
    expect(document.body.contains(lastModal().element)).toBe(false);
  });

  it('lets "Discard" through without applying anything', async () => {
    const { modal, onApply } = await openModal();
    dirty(modal);
    footerButton(modal, 'Close').click();

    footerButton(lastModal().element, 'Discard').click();

    expect(document.body.contains(modal)).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('turns the interception into a shortcut with "Apply & close"', async () => {
    const { modal, onApply } = await openModal();
    dirty(modal);
    footerButton(modal, 'Close').click();

    footerButton(lastModal().element, 'Apply & close').click();

    await expect.poll(() => onApply.mock.calls).toEqual([['doktype:1 is:hidden']]);
    expect(document.body.contains(modal)).toBe(false);
  });
});

describe('Reset', () => {
  it('clears every criterion but stays in the modal', async () => {
    const { modal } = await openModal({
      configuration: configurationFixture({ activeSite: 'other', pageScope: 5, freetext: 'contact' }),
    });
    type(control(modal, 'activity[changed]'), '7d');

    modal.querySelector('.pagetree-facets__reset').click();

    expect(chipLabels(modal)).toEqual([]);
    expect(control(modal, 'state[is]', 'hidden').checked).toBe(false);
    expect(control(modal, 'activity[changed]').value).toBe('');
    expect(modal.querySelector('[data-role="freetext"]').value).toBe('');
    expect(modal.querySelector('[data-role="site-scope"]').value).toBe('');
    expect(modal.querySelector('[data-role="page-scope"]').checked).toBe(false);
    expect(modal.querySelector('.pagetree-facets__hint').hidden).toBe(false);
    expect(document.body.contains(modal)).toBe(true);
  });

  it('clears a multi-select too, not just checkboxes', async () => {
    const configuration = configurationFixture();
    configuration.tabs[0].configuration.fields[0].type = 'select';
    configuration.tabs[0].state = { doktype: ['1'] };
    const { modal } = await openModal({ configuration });
    expect(chipLabels(modal)).toContain('Page type: Standard');

    modal.querySelector('.pagetree-facets__reset').click();

    expect(control(modal, 'doktype[doktype]').selectedOptions).toHaveLength(0);
    expect(chipLabels(modal)).toEqual([]);
  });
});

describe('the navigation', () => {
  const arrow = (item, key) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    item.dispatchEvent(event);

    return event;
  };

  it('moves with the arrows and switches as it goes', async () => {
    const { modal } = await openModal();

    const event = arrow(navItem(modal, 'doktype'), 'ArrowDown');

    expect(event.defaultPrevented).toBe(true);
    expect(panel(modal, 'state').hidden).toBe(false);
    expect(navItem(modal, 'state').tabIndex).toBe(0);
    expect(navItem(modal, 'doktype').tabIndex).toBe(-1);
  });

  it('steps over the disabled tab and the hidden favorites item', async () => {
    const { modal } = await openModal();

    arrow(navItem(modal, 'state'), 'ArrowDown');

    // translations is optionless, favorites has nothing saved yet.
    expect(panel(modal, 'activity').hidden).toBe(false);
  });

  it('wraps around, and Home/End jump to the ends', async () => {
    const { modal } = await openModal();

    arrow(navItem(modal, 'doktype'), 'ArrowUp');
    expect(panel(modal, 'activity').hidden).toBe(false);

    arrow(navItem(modal, 'activity'), 'Home');
    expect(panel(modal, 'doktype').hidden).toBe(false);

    arrow(navItem(modal, 'doktype'), 'End');
    expect(panel(modal, 'activity').hidden).toBe(false);
  });

  it('leaves every other key to the browser', async () => {
    const { modal } = await openModal();

    const event = arrow(navItem(modal, 'doktype'), 'ArrowLeft');

    expect(event.defaultPrevented).toBe(false);
    expect(panel(modal, 'doktype').hidden).toBe(false);
  });

  it('moves focus into the panel when a tab is picked outright', async () => {
    // Which control inside receives it depends on layout (offsetParent), which
    // jsdom does not implement - so this only pins down that focus lands in the
    // panel, never in the navigation.
    const { modal } = await openModal();

    navItem(modal, 'state').click();

    expect(panel(modal, 'state').contains(document.activeElement)).toBe(true);
  });
});

describe('the cross-tab filter search', () => {
  const search = (modal, query) => type(modal.querySelector('[data-role="filter-search"]'), query);

  it('replaces the panels with matches from every tab', async () => {
    const { modal } = await openModal();

    search(modal, 'hidden');

    expect(modal.querySelector('.pagetree-facets__search-results').hidden).toBe(false);
    expect(panel(modal, 'doktype').hidden).toBe(true);
    // No tab is current while searching, so the announcement must not claim one.
    expect(modal.querySelector('.pagetree-facets__nav-item[aria-current]')).toBeNull();
    expect([...modal.querySelectorAll('.pagetree-facets__search-result-label')].map((l) => l.textContent))
      .toEqual(['Hidden']);
  });

  it('says so when nothing matches', async () => {
    const { modal } = await openModal();

    search(modal, 'zzz');

    expect(modal.querySelector('.pagetree-facets__search-empty')).not.toBeNull();
  });

  it('writes a toggled result back to the control in its hidden panel', async () => {
    const { modal } = await openModal();
    search(modal, 'standard');

    const proxy = modal.querySelector('.pagetree-facets__search-results input');
    proxy.click();

    expect(control(modal, 'doktype[doktype]', '1').checked).toBe(true);
    expect(chipLabels(modal)).toContain('Page type: Standard');
  });

  it('restores the panels once the query is cleared', async () => {
    const { modal } = await openModal();
    search(modal, 'hidden');

    search(modal, '');

    expect(modal.querySelector('.pagetree-facets__search-results').hidden).toBe(true);
    expect(panel(modal, 'doktype').hidden).toBe(false);
    expect(navItem(modal, 'doktype').getAttribute('aria-current')).toBe('true');
  });

  it('is cleared again by picking a tab', async () => {
    const { modal } = await openModal();
    search(modal, 'hidden');

    navItem(modal, 'state').click();

    expect(modal.querySelector('[data-role="filter-search"]').value).toBe('');
    expect(modal.querySelector('.pagetree-facets__search-results').hidden).toBe(true);
  });
});
