import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * facets-toolbar.js's empty-result notice: the way out of "the filter matched
 * nothing and the tree just went blank".
 *
 * It hangs off the core's own filter lifecycle events (typo3:tree:filter-applied
 * and -reset), which bubble to document - so the tests dispatch those directly
 * rather than trying to imitate a page tree. What the events carry in production,
 * and that they fire at all, is verified in Tests/Playwright/tests/empty-result.spec.ts;
 * here the subject is the decision the toolbar makes from a given payload.
 *
 * `resultCount` deliberately cannot be compared against 0: the core's filter
 * always returns the entry point node(s), so a filter matching nothing still
 * reports one item per entry point. The `nodes` array set on the tree element
 * below is what that check reads instead.
 */

vi.mock('@konradmichalik/pagetree-facets/facets-modal.js', () => ({ default: { open: vi.fn() } }));

const notice = () => document.querySelector('.pagetree-facets-empty');
const searchInput = () => document.querySelector('input[name="searchTerm"]');
const treeElement = () => document.querySelector('typo3-backend-navigation-component-pagetree-tree');

/** @param {Array<{depth: number}>} nodes - what the tree reports after filtering */
function buildTree(nodes = []) {
  document.body.innerHTML = `
    <typo3-backend-navigation-component-pagetree>
      <div class="tree-toolbar">
        <div class="tree-toolbar__menu">
          <div class="tree-toolbar__search"><input type="search" name="searchTerm"></div>
        </div>
      </div>
      <typo3-backend-navigation-component-pagetree-tree></typo3-backend-navigation-component-pagetree-tree>
    </typo3-backend-navigation-component-pagetree>
  `;
  treeElement().nodes = nodes;
}

const filterApplied = (resultCount) => document.dispatchEvent(
  new CustomEvent('typo3:tree:filter-applied', { bubbles: true, composed: true, detail: { resultCount } }),
);

const filterReset = () => document.dispatchEvent(
  new CustomEvent('typo3:tree:filter-reset', { bubbles: true, composed: true }),
);

async function loadToolbar({ nodes = [], notice: enabled = true } = {}) {
  buildTree(nodes);
  globalThis.TYPO3 = {
    lang: {},
    settings: { ajaxUrls: {}, PagetreeFacets: { emptyResultNotice: enabled ? '1' : '0' } },
  };
  vi.resetModules();
  await import('@konradmichalik/pagetree-facets/facets-toolbar.js');
}

beforeEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/typo3/module/web/layout');
});

describe('when a filter matches nothing', () => {
  it('offers the way out beside the emptiness, announced politely', async () => {
    await loadToolbar();

    filterApplied(0);

    expect(notice().getAttribute('role')).toBe('status');
    expect(notice().querySelector('.pagetree-facets-empty__text').textContent)
      .toBe('No pages match the current filter.');
    expect([...notice().querySelectorAll('button')].map((button) => button.textContent))
      .toEqual(['Adjust filter', 'Reset filter']);
  });

  it('is placed beside the tree, never inside its own render root', async () => {
    // The tree renders into its own light DOM, so anything put in there is
    // discarded on its next render.
    await loadToolbar();

    filterApplied(0);

    expect(notice().previousElementSibling).toBe(treeElement());
  });

  it('reads emptiness off the nodes, not off a result count that never reaches 0', async () => {
    // One node per entry point (the virtual root for admins, web mounts
    // otherwise) and nothing below it: the tree looks empty.
    await loadToolbar({ nodes: [{ depth: 0 }] });

    filterApplied(1);

    expect(notice()).not.toBeNull();
  });

  it('stays away while anything matched below the entry points', async () => {
    await loadToolbar({ nodes: [{ depth: 0 }, { depth: 1 }] });

    filterApplied(2);

    expect(notice()).toBeNull();
  });

  it('is not stacked up by repeated filtering', async () => {
    await loadToolbar();

    filterApplied(0);
    filterApplied(0);

    expect(document.querySelectorAll('.pagetree-facets-empty')).toHaveLength(1);
  });

  it('goes away once the phrase is empty again', async () => {
    await loadToolbar();
    filterApplied(0);

    // The core dispatches -reset instead of -applied for an empty phrase.
    filterReset();

    expect(notice()).toBeNull();
  });

  it('stays absent when there is no tree or field to attach it to', async () => {
    await loadToolbar();
    searchInput().remove();

    filterApplied(0);

    expect(notice()).toBeNull();
  });
});

describe('the notice actions', () => {
  it('clears the filter and drops the notice right away on "Reset filter"', async () => {
    await loadToolbar();
    searchInput().value = 'is:hidden';
    filterApplied(0);
    const refiltered = vi.fn();
    // The core's toolbar reloads the tree from this input's own event.
    searchInput().addEventListener('input', refiltered);

    notice().querySelectorAll('button')[1].click();

    expect(searchInput().value).toBe('');
    expect(refiltered).toHaveBeenCalled();
    // filter-reset would clear it too, but only after the debounce and request.
    expect(notice()).toBeNull();
    expect(document.querySelector('.pagetree-facets-toggle .badge')).toBeNull();
  });

  it('opens the modal on the phrase that just failed via "Adjust filter"', async () => {
    await loadToolbar();
    searchInput().value = 'is:hidden doktype:4';
    filterApplied(0);
    const modal = (await import('@konradmichalik/pagetree-facets/facets-modal.js')).default;

    notice().querySelectorAll('button')[0].click();

    expect(modal.open).toHaveBeenCalledWith('is:hidden doktype:4', null, expect.any(Function));
  });
});

describe('with the notice switched off', () => {
  it('registers no listeners at all, rather than listening and doing nothing', async () => {
    const registered = vi.spyOn(document, 'addEventListener');

    await loadToolbar({ notice: false });

    expect(registered.mock.calls.map(([type]) => type)).not.toContain('typo3:tree:filter-applied');
    registered.mockRestore();
  });
});
