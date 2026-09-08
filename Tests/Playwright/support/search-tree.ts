import type { Page } from '@playwright/test';
import { type PageTreePage, resolveTypo3Version } from '@konradmichalik/ptu';

const FILTER_APPLIED_EVENT = 'typo3:tree:filter-applied';

// The element that holds the nodes and the reactive state, queried straight
// from the document the way wait-for-page-tree-ready.ts does - the outer
// <...-pagetree> wrapper only adds the toolbar and nothing this needs.
const TREE_SELECTOR = 'typo3-backend-navigation-component-pagetree-tree';

declare global {
  interface Window {
    __pagetreeFacetsFilterApplied?: Promise<unknown>;
  }
}

/**
 * Fills the tree's search field with `phrase` and waits for the resulting
 * debounced filter AJAX round trip to resolve.
 *
 * Every tree search in this suite must go through this helper instead of
 * calling `tree.search()` directly. `tree.search()` only fills the input;
 * whatever runs right after it - a node-visibility assertion, opening the
 * facets modal, reading the search field back - races the tree's own
 * debounced request. Confirmed via a captured Playwright trace during the
 * task-17 instability investigation: a `pagetree-facets/configuration`
 * request fired with `phrase=` empty despite the field having just been
 * filled, producing intermittent failures in `hydration.spec.ts` and
 * `share-link.spec.ts`. That race is not confined to the two specs it
 * happened to surface in - every search is equally exposed - so routing all
 * of them through one helper removes the judgement call of "does this
 * particular search need the wait". The answer is always yes.
 *
 * How that wait is done depends on the TYPO3 version, because the signal does.
 */
export async function searchTree(page: Page, tree: PageTreePage, phrase: string): Promise<void> {
  if (resolveTypo3Version() === '13') {
    return searchTreeV13(page, tree, phrase);
  }

  return searchTreeV14(page, tree, phrase);
}

/**
 * `typo3:tree:filter-applied` is dispatched by TYPO3 v14 core's Tree web
 * component once the filter request resolves (see `filter()` in
 * `vendor/typo3/cms-backend/.../tree/tree.js`), which is what lets this wait
 * on a real signal rather than a fixed sleep. The listener is registered
 * before the search rather than after, because the event can fire before a
 * subsequent round trip would have had time to subscribe.
 */
async function searchTreeV14(page: Page, tree: PageTreePage, phrase: string): Promise<void> {
  await page.evaluate((eventName) => {
    window.__pagetreeFacetsFilterApplied = new Promise((resolve) => {
      document.addEventListener(eventName, resolve, { once: true });
    });
  }, FILTER_APPLIED_EVENT);

  await tree.search(phrase);

  await page.evaluate(() => window.__pagetreeFacetsFilterApplied);
}

/**
 * v13's tree dispatches no filter lifecycle events at all - they were added in
 * v14 together with the filter event on the PHP side - so there is nothing to
 * subscribe to. What it does have is the two reactive properties `filter()`
 * drives: it assigns `searchTerm` and raises `loading` in one synchronous block
 * when the debounce fires, and lowers `loading` again once the response has been
 * turned into nodes. Waiting for "the tree has taken this phrase and is idle
 * again" is therefore exact rather than a heuristic, and it also covers clearing
 * the filter, which on v13 may restore cached nodes without any request at all.
 *
 * Reaching into component state is something only this harness does; the
 * extension's own JavaScript stays on public events and the search input.
 */
async function searchTreeV13(page: Page, tree: PageTreePage, phrase: string): Promise<void> {
  await tree.search(phrase);

  await page.waitForFunction(
    ([selector, expected]) => {
      const treeElement = document.querySelector(selector) as
        (Element & { loading?: boolean; searchTerm?: string | null }) | null;

      return !!treeElement && false === treeElement.loading && (treeElement.searchTerm ?? '') === expected;
    },
    [TREE_SELECTOR, phrase.trim()] as const,
  );
}
