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

  it('says what the click does and keeps the phrase itself one hover away', () => {
    const rows = favoriteRows(favorites, { onLoad: vi.fn(), onRemove: vi.fn() });

    // The row shows resolved criteria now, so the phrase lives here or nowhere.
    expect(rows[0].querySelector('.pagetree-facets__favorite-load').title)
      .toBe('Loads this filter into the dialog. It takes effect once you apply.\nis:hidden');
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
    const { form, open, close } = buildSaveFavoriteForm({ onSave });
    const opener = document.createElement('button');
    opener.type = 'button';
    document.body.replaceChildren(opener, form);

    return { form, open, close, opener, onSave, input: form.querySelector('input') };
  };

  it('starts hidden', () => {
    expect(mount().form.hidden).toBe(true);
  });

  it('opens on demand with the name field focused', () => {
    const { form, open, opener, input } = mount();

    open(opener);

    expect(form.hidden).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('saves the entered name, closes and hands focus back to whatever opened it', () => {
    const { form, open, opener, onSave, input } = mount();
    open(opener);
    input.value = 'My filter';

    form.querySelector('.btn-primary').click();

    expect(onSave).toHaveBeenCalledWith('My filter');
    expect(form.hidden).toBe(true);
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(opener);
  });

  it('saves on Enter without letting the modal apply and close', () => {
    const { open, opener, onSave, input } = mount();
    open(opener);
    input.value = 'Via keyboard';

    const reachedModal = vi.fn();
    document.body.addEventListener('keydown', reachedModal);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(onSave).toHaveBeenCalledWith('Via keyboard');
    expect(reachedModal).not.toHaveBeenCalled();
  });

  it('discards the entry on Escape and on Cancel', () => {
    const { form, open, opener, onSave, input } = mount();

    open(opener);
    input.value = 'abandoned';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(opener);

    open(opener);
    input.value = 'abandoned again';
    form.querySelector('.btn-default').click();
    expect(onSave).not.toHaveBeenCalled();
    expect(form.hidden).toBe(true);
  });

  it('can be closed from outside without moving focus, and is a no-op while closed', () => {
    const { form, open, close, opener, input } = mount();
    open(opener);
    input.value = 'typing';

    close();
    expect(form.hidden).toBe(true);
    expect(input.value).toBe('');
    expect(document.activeElement).not.toBe(opener);

    expect(() => close()).not.toThrow();
  });

  it('leaves every other key to do whatever it would do in a plain text input', () => {
    const { form, open, opener, onSave, input } = mount();

    open(opener);
    input.value = 'still typing';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(input.value).toBe('still typing');
    expect(form.hidden).toBe(false);
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
