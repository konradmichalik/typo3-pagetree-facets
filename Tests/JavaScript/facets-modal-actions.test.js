import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shownNotifications } from './Stubs/typo3/backend/notification.js';
import {
  applyButton,
  chipLabels,
  configurationFixture,
  navItem,
  openModal,
  panel,
  requests,
  resetHarness,
  urls,
} from './Support/modal-harness.js';

/*
 * facets-modal.js, part four: the filter-wide actions - saved favorites and
 * "copy link". Both export whatever is currently configured, which is why they
 * share a suite with the phrase they are built from.
 */

const saved = [{ label: 'Hidden pages', tokenString: 'is:hidden' }];

const favoritesItem = (modal) => navItem(modal, '__favorites').closest('li');

const saveFavorite = (modal, label) => {
  modal.querySelector('.pagetree-facets__favorite-add').click();
  const form = modal.querySelector('.pagetree-facets__favorite-form');
  form.querySelector('input').value = label;
  form.querySelector('.btn-primary').click();
};

beforeEach(() => {
  resetHarness();
});

describe('the favorites tab', () => {
  it('stays hidden while nothing is saved, so it never shows an empty panel', async () => {
    const { modal } = await openModal();

    expect(favoritesItem(modal).hidden).toBe(true);
  });

  it('lists what is saved, phrase and all', async () => {
    const { modal } = await openModal({ favorites: saved });

    expect(favoritesItem(modal).hidden).toBe(false);
    expect(modal.querySelector('.pagetree-facets__favorite-label').textContent).toBe('Hidden pages');
    expect(modal.querySelector('.pagetree-facets__favorite-phrase').textContent).toBe('is:hidden');
  });

  it('loads a favorite into the form instead of applying it behind the guard', async () => {
    // Selecting is not applying, here as everywhere else in the modal: the
    // favorite becomes a pending selection that Apply still has to confirm.
    const { modal, onApply } = await openModal({
      configuration: (phrase) => {
        const hydrated = configurationFixture();
        hydrated.tabs[1].state = 'is:hidden' === phrase ? { is: ['hidden'] } : {};

        return hydrated;
      },
      favorites: saved,
    });
    expect(chipLabels(modal)).toEqual([]);

    modal.querySelector('.pagetree-facets__favorite-load').click();

    await expect.poll(() => chipLabels(modal)).toEqual(['Page state: Hidden']);
    expect(document.body.contains(modal)).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
    expect(applyButton(modal).disabled).toBe(false);
    expect(modal.querySelector('.pagetree-facets__pending').hidden).toBe(false);
  });

  it('applies what was loaded once Apply confirms it', async () => {
    const { modal, onApply } = await openModal({
      configuration: (phrase) => {
        const hydrated = configurationFixture();
        hydrated.tabs[1].state = 'is:hidden' === phrase ? { is: ['hidden'] } : {};

        return hydrated;
      },
      favorites: saved,
    });

    modal.querySelector('.pagetree-facets__favorite-load').click();
    await expect.poll(() => applyButton(modal).disabled).toBe(false);
    applyButton(modal).click();

    await expect.poll(() => onApply.mock.calls).toEqual([['is:hidden']]);
  });

  it('takes focus itself when its panel has nothing focusable inside', async () => {
    // Activating a tab must never leave focus behind in the navigation, and an
    // empty favorites panel holds no control that could take it.
    const { modal } = await openModal();

    navItem(modal, '__favorites').click();

    expect(document.activeElement).toBe(panel(modal, '__favorites'));
  });

  it('never carries a criteria count - it is not a criterion', async () => {
    const { modal } = await openModal({ favorites: saved });

    expect(navItem(modal, '__favorites').querySelector('.pagetree-facets__nav-count')).toBeNull();
  });
});

describe('saving the current filter', () => {
  it('posts the name with the serialized phrase and reveals the tab', async () => {
    const { modal } = await openModal();

    saveFavorite(modal, 'Hidden pages');

    await expect.poll(() => favoritesItem(modal).hidden).toBe(false);
    expect(requests().at(-1)).toEqual({
      url: urls.favoriteAdd,
      body: { label: 'Hidden pages', tokenString: 'is:hidden' },
    });
    expect(modal.querySelector('.pagetree-facets__favorite-label').textContent).toBe('Hidden pages');
    expect(shownNotifications()).toEqual([{
      severity: 'success',
      title: 'Favorite saved',
      message: 'The current filter was saved to your favorites.',
    }]);
  });

  it('saves nothing when there is nothing configured', async () => {
    // The action is hidden in that case, so this only pins down the guard behind
    // it - a phrase of "" would otherwise become a favorite that filters nothing.
    const configuration = configurationFixture();
    configuration.tabs[1].state = {};
    const { modal } = await openModal({ configuration });

    saveFavorite(modal, 'Nothing');

    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(requests().filter((request) => request.url === urls.favoriteAdd)).toEqual([]);
    expect(shownNotifications()).toEqual([]);
  });
});

describe('removing a favorite', () => {
  it('hides the tab again once the last one is gone', async () => {
    const { modal } = await openModal({ favorites: saved });

    modal.querySelector('.pagetree-facets__favorite-remove').click();

    await expect.poll(() => favoritesItem(modal).hidden).toBe(true);
    expect(requests().at(-1)).toEqual({ url: urls.favoriteRemove, body: { index: 0 } });
  });

  it('falls back to a usable filter tab when the open panel disappears', async () => {
    const { modal } = await openModal({ favorites: saved });
    navItem(modal, '__favorites').click();
    expect(panel(modal, '__favorites').hidden).toBe(false);

    modal.querySelector('.pagetree-facets__favorite-remove').click();

    await expect.poll(() => panel(modal, 'doktype').hidden).toBe(false);
    expect(panel(modal, '__favorites').hidden).toBe(true);
  });

  it('keeps the tab while others remain', async () => {
    const { modal } = await openModal({
      favorites: [...saved, { label: 'Shortcuts', tokenString: 'doktype:4' }],
    });

    modal.querySelector('.pagetree-facets__favorite-remove').click();

    await expect.poll(() => modal.querySelectorAll('.pagetree-facets__favorite')).toHaveLength(1);
    expect(favoritesItem(modal).hidden).toBe(false);
  });
});

describe('copy link', () => {
  let writeText;

  beforeEach(() => {
    writeText = vi.fn(async () => {});
    // jsdom implements no clipboard at all, so it is defined per test rather than
    // spied on - which also means the permission prompt a real browser may show is
    // out of scope here.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  it('copies the current view with the phrase attached', async () => {
    const { modal } = await openModal();

    modal.querySelector('.pagetree-facets__copy-link').click();

    await expect.poll(() => writeText).toHaveBeenCalled();
    const copied = new URL(writeText.mock.calls[0][0]);
    // The same param facets-toolbar.js reads back on load.
    expect(copied.searchParams.get('pagetreeFacetsFilter')).toBe('is:hidden');
    expect(copied.pathname).toBe(new URL(window.location.href).pathname);
    expect(shownNotifications()).toEqual([{
      severity: 'success',
      title: 'Link copied',
      message: 'The filter link was copied to your clipboard.',
    }]);
  });

  it('says so when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { modal } = await openModal();

    modal.querySelector('.pagetree-facets__copy-link').click();

    await expect.poll(() => shownNotifications()).toEqual([{
      severity: 'error',
      title: 'Copy failed',
      message: 'Could not copy the link to your clipboard.',
    }]);
  });
});
