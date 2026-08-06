import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Covers facets-toolbar.js's #extractSharedFilter()/#scrubShareParam() (the
 * "copy link" read-back and scrub - see the class docblock and
 * Tests/Playwright/tests/share-link.spec.ts).
 *
 * Getting real code under test here needed two things neither of which existed
 * before: a `@typo3/backend/hotkeys.js` alias (the file's first import, no
 * package for it anywhere - see the stub's own docblock) and a mock for
 * `facets-modal.js`, since that one drags in `@typo3/backend/modal.js`,
 * `notification.js` and `enum/severity.js`, none of which this suite needs to
 * open the modal to exercise the extraction/scrub logic.
 *
 * `#extractSharedFilter()`/`#scrubShareParam()` are private and the module's
 * only export is `new FacetsToolbar()`, a singleton constructed as a side
 * effect of the import itself - so every test below forces a fresh import via
 * `vi.resetModules()` and observes the *outcome* through the two things the
 * constructor touches synchronously on that first pass: `window.location`
 * and the tree's search input (built fresh per test in `buildTree()`, so
 * `#injectButton()`'s first, synchronous attempt finds it and applies
 * `#pendingSharedFilter` immediately - no need to wait out the retry loop).
 *
 * What this suite can genuinely prove: the direct and redirectParams
 * extraction branches read the right phrase and scrub the right thing, a URL
 * with neither leaves both alone, and the `typo3-module-loaded` listener
 * removes the param if it reappears on `location.href` after the fact. What
 * it cannot prove - because jsdom runs no module router - is that TYPO3's own
 * router is what actually causes that reappearance in production; that part
 * is simulated here by hand (a plain replaceState back to the same URL) and
 * is only really demonstrated end-to-end by share-link.spec.ts.
 */

const SHARE_PARAM = 'pagetreeFacetsFilter';

vi.mock('@konradmichalik/pagetree-facets/facets-modal.js', () => ({ default: { open: vi.fn() } }));

function buildTree() {
  document.body.innerHTML = `
    <typo3-backend-navigation-component-pagetree>
      <input type="search" name="searchTerm">
    </typo3-backend-navigation-component-pagetree>
  `;
}

function searchInput() {
  return document.querySelector('input[name="searchTerm"]');
}

function currentParam() {
  return new URL(window.location.href).searchParams.get(SHARE_PARAM);
}

async function loadToolbarAt(url) {
  window.history.replaceState(null, '', url);
  buildTree();
  vi.resetModules();
  await import('@konradmichalik/pagetree-facets/facets-toolbar.js');
}

beforeEach(() => {
  globalThis.TYPO3 = { lang: {}, settings: {} };
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
