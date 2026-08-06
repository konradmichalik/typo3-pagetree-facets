import type { Page } from '@playwright/test';

const TREE_SELECTOR = 'typo3-backend-navigation-component-pagetree-tree';

/**
 * Waits for the page tree's own initial data load to finish.
 *
 * The tree is a Lit web component (`vendor/typo3/cms-backend/.../tree/
 * tree.js`) that keeps loading/rendering asynchronously well past the
 * `load` event `BackendPage.openModule()` waits for - `firstUpdated()`
 * calls `loadData()`, which replaces the tree's own rendered DOM (including
 * the search input every test fills) only once that first load resolves.
 * Interacting with the tree before that settles risks acting on a node the
 * component is about to discard and replace: during the task-17 instability
 * investigation, a search performed too early under a loaded instance
 * produced no filter network request at all - the typed value landed on an
 * input that got swapped out from under it. `tree.loadComplete` is a getter
 * the component exposes for exactly this; it is safe to await even if the
 * load already finished by the time this runs, since a fresh pending
 * promise is installed for every subsequent load.
 */
export async function waitForPageTreeReady(page: Page): Promise<void> {
  await page.evaluate(async (selector) => {
    const tree = document.querySelector(selector) as (Element & { loadComplete?: Promise<unknown> }) | null;
    await tree?.loadComplete;
  }, TREE_SELECTOR);
}
