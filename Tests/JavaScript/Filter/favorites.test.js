import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFavorite,
  buildSaveFavoriteForm,
  favoriteRows,
  removeFavoriteAt,
} from '@konradmichalik/pagetree-facets/Filter/favorites.js';
import { requests, resetAjaxStub, respondWith } from '../Stubs/typo3/core/ajax/ajax-request.js';

const favorites = [
  { label: 'Hidden pages', tokenString: 'is:hidden', criteria: ['Page state: Hidden'] },
  {
    label: 'Empty shortcuts',
    tokenString: 'doktype:4 is:empty',
    criteria: ['Page type: Shortcut', 'Page state: Empty'],
  },
];

beforeEach(() => {
  resetAjaxStub();
  globalThis.TYPO3 = {
    lang: {},
    settings: {
      ajaxUrls: {
        typo3_pagetree_facets_favorite_add: '/favorite/add',
        typo3_pagetree_facets_favorite_remove: '/favorite/remove',
      },
    },
  };
});

describe('favoriteRows', () => {
  it('renders one row per favorite, named and described in the modal\'s own words', () => {
    const rows = favoriteRows(favorites, { onLoad: vi.fn(), onRemove: vi.fn() });

    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.pagetree-facets__favorite-label').textContent).toBe('Hidden pages');
    expect(rows[1].querySelector('.pagetree-facets__favorite-criteria').textContent)
      .toBe('Page type: Shortcut · Page state: Empty');
  });

  it('keeps the phrase itself on the title, one hover away', () => {
    const rows = favoriteRows(favorites, { onLoad: vi.fn(), onRemove: vi.fn() });

    expect(rows[0].querySelector('.pagetree-facets__favorite-load').title).toBe('is:hidden');
  });

  it('leaves the second line out when the name already is the summary', () => {
    // The server drops `criteria` in that case (see describeFavorites) rather
    // than letting the row say the same thing twice.
    const rows = favoriteRows([{ label: 'Page state: Hidden', tokenString: 'is:hidden', criteria: [] }], {
      onLoad: vi.fn(),
      onRemove: vi.fn(),
    });

    expect(rows[0].querySelector('.pagetree-facets__favorite-criteria')).toBeNull();
  });

  it('reports the phrase, not the label', () => {
    const onLoad = vi.fn();
    const rows = favoriteRows(favorites, { onLoad, onRemove: vi.fn() });

    rows[1].querySelector('.pagetree-facets__favorite-load').click();

    expect(onLoad).toHaveBeenCalledWith('doktype:4 is:empty');
  });

  it('removes by index, since that is what the endpoint takes', () => {
    const onRemove = vi.fn();
    const rows = favoriteRows(favorites, { onLoad: vi.fn(), onRemove });

    rows[1].querySelector('.pagetree-facets__favorite-remove').click();

    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('names the remove button after its favorite', () => {
    // Several × buttons sit in one list, so the accessible name has to say which
    // one this is rather than just "Remove favorite".
    const rows = favoriteRows(favorites, { onLoad: vi.fn(), onRemove: vi.fn() });

    expect(rows[0].querySelector('.pagetree-facets__favorite-remove').getAttribute('aria-label'))
      .toBe('Hidden pages – Remove favorite');
  });

  it('renders nothing for an empty list', () => {
    expect(favoriteRows([], { onLoad: vi.fn(), onRemove: vi.fn() })).toEqual([]);
  });
});

describe('buildSaveFavoriteForm', () => {
  const mount = (onSave = vi.fn()) => {
    const { toggle, form } = buildSaveFavoriteForm({ onSave });
    document.body.replaceChildren(toggle, form);

    return { toggle, form, onSave, input: form.querySelector('input') };
  };

  it('starts as a toggle with the form hidden', () => {
    const { toggle, form } = mount();

    expect(toggle.hidden).toBe(false);
    expect(form.hidden).toBe(true);
  });

  it('swaps toggle for form when opened', () => {
    const { toggle, form } = mount();

    toggle.click();

    expect(toggle.hidden).toBe(true);
    expect(form.hidden).toBe(false);
  });

  it('saves the entered name and closes again', () => {
    const { toggle, form, onSave, input } = mount();
    toggle.click();
    input.value = 'My filter';

    form.querySelector('.btn-primary').click();

    expect(onSave).toHaveBeenCalledWith('My filter');
    expect(form.hidden).toBe(true);
    expect(toggle.hidden).toBe(false);
    expect(input.value).toBe('');
  });

  it('saves on Enter without letting the modal apply and close', () => {
    const { toggle, onSave, input } = mount();
    toggle.click();
    input.value = 'Via keyboard';

    const reachedModal = vi.fn();
    document.body.addEventListener('keydown', reachedModal);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(onSave).toHaveBeenCalledWith('Via keyboard');
    expect(reachedModal).not.toHaveBeenCalled();
  });

  it('discards the entry on Escape and on Cancel', () => {
    const { toggle, form, onSave, input } = mount();

    toggle.click();
    input.value = 'abandoned';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(input.value).toBe('');

    toggle.click();
    input.value = 'abandoned again';
    form.querySelector('.btn-default').click();
    expect(onSave).not.toHaveBeenCalled();
    expect(form.hidden).toBe(true);
  });
});

describe('the round trips', () => {
  it('posts a trimmed label with the phrase and returns the new list', async () => {
    respondWith(() => ({ favorites }));

    await expect(addFavorite('  My filter  ', 'is:hidden')).resolves.toEqual(favorites);
    expect(requests()).toEqual([
      { url: '/favorite/add', body: { label: 'My filter', tokenString: 'is:hidden' } },
    ]);
  });

  it('posts the index when removing and returns the new list', async () => {
    respondWith(() => ({ favorites: [favorites[0]] }));

    await expect(removeFavoriteAt(1)).resolves.toEqual([favorites[0]]);
    expect(requests()).toEqual([{ url: '/favorite/remove', body: { index: 1 } }]);
  });
});
