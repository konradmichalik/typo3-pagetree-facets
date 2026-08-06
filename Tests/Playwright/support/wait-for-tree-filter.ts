import type { Page } from '@playwright/test';

const FILTER_APPLIED_EVENT = 'typo3:tree:filter-applied';

declare global {
  interface Window {
    __pagetreeFacetsFilterApplied?: Promise<unknown>;
  }
}

/**
 * Waits for the page tree's own `typo3:tree:filter-applied` event (dispatched
 * by TYPO3 core's Tree web component once its debounced filter AJAX request
 * resolves - see `vendor/typo3/cms-backend/.../tree/tree.js`, `filter()`)
 * around an action that triggers a tree search, e.g. `tree.search(phrase)`.
 *
 * `PageTreePage.search()` only fills the search field; the debounced AJAX
 * round trip that actually filters the tree keeps running afterwards.
 * Reacting immediately - most notably opening the facets modal, whose click
 * handler reads the search field's *live* DOM value to build its own AJAX
 * request - races that round trip. Confirmed via a captured Playwright
 * trace during the task-17 instability investigation: a
 * `pagetree-facets/configuration` request fired with `phrase=` empty despite
 * the field having just been filled with a real phrase moments before,
 * producing the intermittent `hydration.spec.ts` and `share-link.spec.ts`
 * failures. Waiting for the tree's own completion event closes that window
 * without resorting to a fixed sleep.
 */
export async function waitForTreeFilterApplied(page: Page, act: () => Promise<void>): Promise<void> {
  await page.evaluate((eventName) => {
    window.__pagetreeFacetsFilterApplied = new Promise((resolve) => {
      document.addEventListener(eventName, resolve, { once: true });
    });
  }, FILTER_APPLIED_EVENT);

  await act();

  await page.evaluate(() => window.__pagetreeFacetsFilterApplied);
}
