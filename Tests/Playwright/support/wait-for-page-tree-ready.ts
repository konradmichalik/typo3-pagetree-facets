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
 * input that got swapped out from under it.
 *
 * `tree.loadComplete` is a getter the component exposes for exactly this -
 * but it is a getter, not a fixed value: `loadData()` resolves the current
 * promise and, in the same synchronous step, installs a fresh forever-
 * pending promise for the *next* load (see `__loadFinished()` /
 * `this.__loadPromise = new Promise(...)` in tree.js). Reading that getter
 * after the initial load has already resolved and rolled over - with no
 * second load ever triggered - means awaiting a promise nothing will ever
 * settle. Reading it in the same microtask as the existence check narrows
 * that window but cannot close it: if the load finishes before this helper
 * runs at all, the very first read already returns the rolled-over promise.
 * That is not hypothetical - it hangs several tests per suite run against the
 * faster-booting v13 instance.
 *
 * So the promise is raced against the state it stands for. `loadData()` raises
 * `loading` before fetching and lowers it after the node map has been
 * assigned, so "not loading, and nodes present" is true exactly when a load has
 * completed - including one that completed before this helper was called - and
 * never during the pre-`firstUpdated()` window, where the tree has no nodes
 * yet. Whichever arrives first is the same condition; the poll only exists
 * because a resolved promise leaves no trace to await a second time.
 */
export async function waitForPageTreeReady(page: Page): Promise<void> {
  await page.evaluate(async (selector) => {
    const POLL_INTERVAL_MS = 20;
    const TIMEOUT_MS = 10000;
    const deadline = Date.now() + TIMEOUT_MS;

    let tree = document.querySelector(selector) as (Element & { loadComplete?: Promise<unknown> }) | null;
    // A loop rather than a single check only matters for the rare case where
    // the custom element genuinely has not upgraded yet; once it exists, this
    // exits on its first (synchronous, zero-delay) pass, so the happy path
    // reads `loadComplete` exactly as promptly as a plain `tree?.loadComplete`
    // would have. What optional chaining did instead was let a missing
    // element, or a missing getter, resolve to `undefined` and return
    // silently - the difference here is that giving up now throws instead.
    while (!tree || !('loadComplete' in tree)) {
      if (Date.now() > deadline) {
        throw new Error(`"${selector}" never appeared or never exposed "loadComplete" within ${TIMEOUT_MS}ms.`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      tree = document.querySelector(selector) as (Element & { loadComplete?: Promise<unknown> }) | null;
    }

    const loaded = tree as Element & {
      loadComplete: Promise<unknown>;
      loading?: boolean;
      nodes?: ReadonlyArray<unknown>;
    };

    await Promise.race([
      loaded.loadComplete,
      (async () => {
        while (true) {
          if (false === loaded.loading && (loaded.nodes?.length ?? 0) > 0) {
            return;
          }
          if (Date.now() > deadline) {
            throw new Error(`"${selector}" did not finish its initial load within ${TIMEOUT_MS}ms.`);
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      })(),
    ]);
  }, TREE_SELECTOR);
}
