import type { Page } from '@playwright/test';
import type { PageTreePage } from '@konradmichalik/ptu';
import { waitForTreeFilterApplied } from './wait-for-tree-filter.js';

/**
 * Fills the tree's search field with `phrase` and waits for the resulting
 * debounced filter AJAX round trip to resolve.
 *
 * Every tree search in this suite must go through this helper instead of
 * calling `tree.search()` directly. `tree.search()` only fills the input;
 * whatever runs right after it - a node-visibility assertion, opening the
 * facets modal, reading the search field back - races the tree's own
 * debounced request unless something waits for
 * `typo3:tree:filter-applied` first (see `waitForTreeFilterApplied`'s
 * docblock for the trace that caught this). That race is not confined to
 * the two specs it happened to surface in during the task-17 investigation;
 * every search is equally exposed to it. Routing all of them through one
 * helper removes the judgement call of "does this particular search need
 * the wait" - the answer is always yes.
 */
export async function searchTree(page: Page, tree: PageTreePage, phrase: string): Promise<void> {
  await waitForTreeFilterApplied(page, () => tree.search(phrase));
}
