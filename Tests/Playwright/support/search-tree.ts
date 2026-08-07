import type { Page } from '@playwright/test';
import type { PageTreePage } from '@konradmichalik/ptu';

const FILTER_APPLIED_EVENT = 'typo3:tree:filter-applied';

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
 * `typo3:tree:filter-applied` is dispatched by TYPO3 core's Tree web
 * component once the filter request resolves (see `filter()` in
 * `vendor/typo3/cms-backend/.../tree/tree.js`), which is what lets this wait
 * on a real signal rather than a fixed sleep. The listener is registered
 * before the search rather than after, because the event can fire before a
 * subsequent round trip would have had time to subscribe.
 */
export async function searchTree(page: Page, tree: PageTreePage, phrase: string): Promise<void> {
  await page.evaluate((eventName) => {
    window.__pagetreeFacetsFilterApplied = new Promise((resolve) => {
      document.addEventListener(eventName, resolve, { once: true });
    });
  }, FILTER_APPLIED_EVENT);

  await tree.search(phrase);

  await page.evaluate(() => window.__pagetreeFacetsFilterApplied);
}
