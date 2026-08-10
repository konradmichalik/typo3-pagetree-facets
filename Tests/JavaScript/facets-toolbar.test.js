import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * facets-toolbar.js: everything that happens around the page tree's own search
 * field - the toolbar button and its criteria badge, the hotkey, the "copy link"
 * read-back and scrub, and the opt-in session persistence.
 *
 * The module's only export is `new FacetsToolbar()`, a singleton constructed as a
 * side effect of the import, and everything it does is private - so each test
 * forces a fresh import via `vi.resetModules()` and observes the outcome through
 * the two things the constructor touches: `window.location` and the tree markup
 * built per test in `buildTree()`. That markup mirrors the v14 tree toolbar
 * (.tree-toolbar__menu > .tree-toolbar__search > input), which is the one piece of
 * core DOM this extension couples to.
 *
 * `facets-modal.js` is mocked away: it drags in core's modal, notification and
 * severity modules, and none of them are needed to prove that the toolbar hands
 * the right phrase over and applies what comes back.
 *
 * What this suite cannot prove - because jsdom runs no module router and no page
 * tree - is that TYPO3's router is what re-attaches a scrubbed share param, or
 * that the core's filter events fire as assumed. That is Tests/Playwright's part
 * (see share-link.spec.ts and empty-result.spec.ts).
 */

const SHARE_PARAM = 'pagetreeFacetsFilter';
const PERSIST_URL = '/ajax/persist';

vi.mock('@konradmichalik/pagetree-facets/facets-modal.js', () => ({ default: { open: vi.fn() } }));

function buildTree({ searchWrapper = true } = {}) {
  const input = '<input type="search" name="searchTerm">';
  document.body.innerHTML = `
    <typo3-backend-navigation-component-pagetree>
      <div class="tree-toolbar">
        <div class="tree-toolbar__menu">
          ${searchWrapper ? `<div class="tree-toolbar__search">${input}</div>` : input}
          <button type="button" class="tree-toolbar__collapse-all"></button>
        </div>
      </div>
      <typo3-backend-navigation-component-pagetree-tree></typo3-backend-navigation-component-pagetree-tree>
    </typo3-backend-navigation-component-pagetree>
  `;
}

const searchInput = () => document.querySelector('input[name="searchTerm"]');
const toggleButton = () => document.querySelector('.pagetree-facets-toggle');
const badge = () => toggleButton()?.querySelector('.badge') ?? null;

const currentParam = () => new URL(window.location.href).searchParams.get(SHARE_PARAM);

/** Types into the tree's search field the way the core's own toolbar sees it. */
function filterBy(phrase) {
  searchInput().value = phrase;
  searchInput().dispatchEvent(new Event('input', { bubbles: true }));
}

async function loadToolbarAt(url, { tree = true, searchWrapper = true, initialPhrase = null } = {}) {
  window.history.replaceState(null, '', url);
  if (tree) {
    buildTree({ searchWrapper });
  }
  if (null !== initialPhrase) {
    searchInput().value = initialPhrase;
  }
  vi.resetModules();
  await import('@konradmichalik/pagetree-facets/facets-toolbar.js');
}

/*
 * resetModules() hands the freshly imported toolbar its own copy of every module
 * it imports - including the stubs, whose recorded calls therefore have to be read
 * from the same late import rather than from a static one at the top of the file
 * (that one would keep pointing at a previous test's copy). Mock functions created
 * by vi.mock() are the exception: they survive resetModules(), so the modal mock is
 * cleared explicitly below.
 */
async function facetsModal() {
  return (await import('@konradmichalik/pagetree-facets/facets-modal.js')).default;
}

async function hotkeyRegistrations() {
  return (await import('./Stubs/typo3/backend/hotkeys.js')).registeredHotkeys();
}

async function ajaxRequests() {
  return (await import('./Stubs/typo3/core/ajax/ajax-request.js')).requests();
}

beforeEach(async () => {
  (await facetsModal()).open.mockClear();
  document.body.replaceChildren();
  globalThis.TYPO3 = {
    lang: {},
    settings: { ajaxUrls: { typo3_pagetree_facets_persist: PERSIST_URL } },
  };
});

describe('a direct pagetreeFacetsFilter param', () => {
  it('is applied to the search input and scrubbed from the URL', async () => {
    const url = new URL('/typo3/module/web/layout', window.location.origin);
    url.searchParams.set(SHARE_PARAM, 'doktype:3');

    await loadToolbarAt(url.toString());

    expect(searchInput().value).toBe('doktype:3');
    expect(currentParam()).toBeNull();
  });
});

describe('a redirectParams-nested pagetreeFacetsFilter param', () => {
  it('is applied to the search input and scrubbed once resolvable', async () => {
    // Mirrors the real shape (see the class docblock): a fresh deep link is
    // server-redirected through /typo3/main?redirect=...&redirectParams=...,
    // with our param double-encoded inside that nested query string.
    const url = new URL('/typo3/main', window.location.origin);
    url.searchParams.set('token', 'abc');
    url.searchParams.set('redirect', 'web_layout');
    url.searchParams.set('redirectParams', `${SHARE_PARAM}=${encodeURIComponent('doktype:3')}`);

    await loadToolbarAt(url.toString());

    expect(searchInput().value).toBe('doktype:3');
    expect(currentParam()).toBeNull();
  });
});

describe('a URL with neither form', () => {
  it('applies nothing and leaves the URL untouched', async () => {
    const url = new URL('/typo3/module/web/layout', window.location.origin);

    await loadToolbarAt(url.toString());

    expect(searchInput().value).toBe('');
    expect(window.location.href).toBe(url.toString());
  });
});

describe('the typo3-module-loaded re-scrub', () => {
  it('removes the param again if it reappears on the URL', async () => {
    const url = new URL('/typo3/module/web/layout', window.location.origin);
    url.searchParams.set(SHARE_PARAM, 'doktype:3');

    await loadToolbarAt(url.toString());
    expect(currentParam()).toBeNull();

    // Stand-in for what TYPO3's module router does for real (confirmed live -
    // see the fix's docblock and report): it calls history.replaceState with
    // a URL rebuilt from redirectParams, putting our param straight back,
    // then dispatches typo3-module-loaded. jsdom has no router to do this on
    // its own, so the reattachment is reproduced by hand; only the listener's
    // reaction to it is under test here.
    window.history.replaceState(window.history.state, '', url.toString());
    expect(currentParam()).toBe('doktype:3');

    document.dispatchEvent(new CustomEvent('typo3-module-loaded', { bubbles: true, composed: true, detail: {} }));

    expect(currentParam()).toBeNull();
  });

  it('is a no-op once the param is already gone', async () => {
    const url = new URL('/typo3/module/web/layout', window.location.origin);
    url.searchParams.set(SHARE_PARAM, 'doktype:3');
    await loadToolbarAt(url.toString());
    const cleanHref = window.location.href;

    document.dispatchEvent(new CustomEvent('typo3-module-loaded', { bubbles: true, composed: true, detail: {} }));

    expect(window.location.href).toBe(cleanHref);
  });
});

describe('the toolbar button', () => {
  it('joins the search input in a button group, named for its hotkey', async () => {
    await loadToolbarAt('/typo3/module/web/layout');

    const group = document.querySelector('.pagetree-facets-search-group');
    // The group wraps input and button as siblings, so the button reads as glued
    // to the input's trailing edge without overlaying its native clear "x".
    expect([...group.children].map((child) => child.className)).toEqual([
      'tree-toolbar__search',
      'btn btn-sm btn-icon btn-default btn-borderless pagetree-facets-toggle',
    ]);
    // Icon-only, and the icon is aria-hidden - so the name cannot be left to title.
    expect(toggleButton().getAttribute('aria-label')).toBe('Filter page tree (Ctrl/Cmd+Shift+L)');
    expect(toggleButton().querySelector('typo3-backend-icon').getAttribute('aria-hidden')).toBe('true');
  });

  it('falls back to the toolbar menu when the search wrapper is missing', async () => {
    await loadToolbarAt('/typo3/module/web/layout', { searchWrapper: false });

    expect(document.querySelector('.pagetree-facets-search-group')).toBeNull();
    expect(toggleButton().parentElement.className).toBe('tree-toolbar__menu');
  });

  it('waits out the asynchronously rendered tree instead of racing it', async () => {
    await loadToolbarAt('/typo3/module/web/layout', { tree: false });
    expect(toggleButton()).toBeNull();

    buildTree();

    // The retry runs on a 250ms backoff, capped at 20 attempts.
    await expect.poll(() => toggleButton(), { timeout: 2000 }).not.toBeNull();
  });

  it('is injected once even when initialization runs twice', async () => {
    // The constructor covers both orders (listener plus a readyState check), so a
    // late DOMContentLoaded must not produce a second button.
    await loadToolbarAt('/typo3/module/web/layout');

    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(document.querySelectorAll('.pagetree-facets-toggle')).toHaveLength(1);
  });
});

describe('the criteria badge', () => {
  it('counts values rather than tokens, so it matches the modal chips', async () => {
    await loadToolbarAt('/typo3/module/web/layout');

    filterBy('doktype:1,4 is:hidden');

    expect(badge().textContent).toBe('3');
    expect(toggleButton().classList.contains('is-active')).toBe(true);
  });

  it('counts a quoted value as one, commas and all', async () => {
    await loadToolbarAt('/typo3/module/web/layout');

    filterBy('text:"a,b,c"');

    expect(badge().textContent).toBe('1');
  });

  it('leaves the site scope out - it mirrors the modal, which does too', async () => {
    await loadToolbarAt('/typo3/module/web/layout');

    filterBy('site:main is:hidden');

    expect(badge().textContent).toBe('1');
  });

  it('ignores freetext, which is not a criterion of its own here', async () => {
    await loadToolbarAt('/typo3/module/web/layout');

    filterBy('contact page');

    expect(badge()).toBeNull();
    expect(toggleButton().classList.contains('is-active')).toBe(false);
  });

  it('disappears again once the phrase is cleared', async () => {
    await loadToolbarAt('/typo3/module/web/layout');
    filterBy('is:hidden');

    filterBy('');

    expect(badge()).toBeNull();
    expect(toggleButton().classList.contains('is-active')).toBe(false);
  });
});

describe('opening the modal', () => {
  it('hands over the current phrase and the page currently open', async () => {
    await loadToolbarAt('/typo3/module/web/layout?id=42');
    const modal = await facetsModal();
    filterBy('is:hidden');

    toggleButton().click();

    expect(modal.open).toHaveBeenCalledWith('is:hidden', 42, expect.any(Function));
  });

  it('reports no page id where the URL carries none', async () => {
    await loadToolbarAt('/typo3/module/web/layout');
    const modal = await facetsModal();

    toggleButton().click();

    expect(modal.open).toHaveBeenCalledWith('', null, expect.any(Function));
  });

  it('is reachable by the registered hotkey too', async () => {
    await loadToolbarAt('/typo3/module/web/layout');
    const modal = await facetsModal();
    const [hotkey] = await hotkeyRegistrations();

    expect(hotkey.keys).toEqual(['ctrl', 'shift', 'l']);
    expect(hotkey.options).toEqual({ scope: 'all', allowOnEditables: true });
    hotkey.callback();

    expect(modal.open).toHaveBeenCalled();
  });

  it('marks the toggle busy while the modal is being built, without disabling it', async () => {
    // Never `disabled`: focus would leave the button before the dialog opens, so
    // the dialog has nothing to restore focus to and ESC drops the user in the body.
    await loadToolbarAt('/typo3/module/web/layout');
    const modal = await facetsModal();
    let release;
    modal.open.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));

    toggleButton().click();

    expect(toggleButton().getAttribute('aria-busy')).toBe('true');
    expect(toggleButton().disabled).toBe(false);

    release();
    await Promise.resolve();

    expect(toggleButton().hasAttribute('aria-busy')).toBe(false);
  });

  it('keeps the busy state until the pending open finishes, hotkey or not', async () => {
    await loadToolbarAt('/typo3/module/web/layout');
    const modal = await facetsModal();
    const [hotkey] = await hotkeyRegistrations();
    let release;
    modal.open.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));

    toggleButton().click();
    // Second attempt while the first is still in flight: FacetsModal guards the
    // modal itself, and this must not clear the first request's busy state.
    hotkey.callback();
    await Promise.resolve();

    expect(modal.open).toHaveBeenCalledTimes(1);
    expect(toggleButton().getAttribute('aria-busy')).toBe('true');

    release();
    await Promise.resolve();

    expect(toggleButton().hasAttribute('aria-busy')).toBe(false);
  });

  it('writes an applied phrase into the tree search field and rebadges', async () => {
    await loadToolbarAt('/typo3/module/web/layout');
    const modal = await facetsModal();
    toggleButton().click();
    const applied = vi.fn();
    // The core's toolbar filters the tree from this input's own "input" event -
    // dispatching it is what makes the phrase take effect.
    searchInput().addEventListener('input', applied);

    modal.open.mock.calls[0][2]('doktype:1,4');

    expect(searchInput().value).toBe('doktype:1,4');
    expect(applied).toHaveBeenCalled();
    expect(badge().textContent).toBe('2');
  });
});

describe('session persistence', () => {
  const enable = (persistedFilter = '') => {
    TYPO3.settings.PagetreeFacets = { persistFilter: '1', persistedFilter };
  };

  it('restores the stored phrase into an untouched search field', async () => {
    enable('is:hidden');

    await loadToolbarAt('/typo3/module/web/layout');

    expect(searchInput().value).toBe('is:hidden');
    expect(badge().textContent).toBe('1');
  });

  it('never clobbers a phrase the user is already looking at', async () => {
    enable('is:hidden');
    const url = new URL('/typo3/module/web/layout', window.location.origin);
    url.searchParams.set(SHARE_PARAM, 'doktype:3');

    await loadToolbarAt(url.toString());

    // A shared link is the more specific intent, so it wins.
    expect(searchInput().value).toBe('doktype:3');
  });

  it('leaves a field that already holds a phrase alone', async () => {
    // E.g. a deep link that pre-filled the field without our share param.
    enable('is:hidden');

    await loadToolbarAt('/typo3/module/web/layout', { initialPhrase: 'doktype:4' });

    expect(searchInput().value).toBe('doktype:4');
  });

  it('saves a changed phrase once the typing stops', async () => {
    enable();
    await loadToolbarAt('/typo3/module/web/layout');

    filterBy('is:h');
    filterBy('is:hidden');

    // Debounced by 400ms: live typing must produce one request, not one per key.
    await expect.poll(ajaxRequests, { timeout: 2000 })
      .toEqual([{ url: PERSIST_URL, body: { phrase: 'is:hidden' } }]);
  });

  it('stays quiet while the setting is off', async () => {
    await loadToolbarAt('/typo3/module/web/layout');

    filterBy('is:hidden');

    await new Promise((resolve) => { setTimeout(resolve, 500); });
    expect(await ajaxRequests()).toEqual([]);
  });
});
