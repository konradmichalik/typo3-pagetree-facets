import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { DEMO_PAGES, NO_MATCH_TOKEN } from '../support/demo-pages.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';
import { searchTree } from '../support/search-tree.js';
import { resolveTypo3Version } from '@konradmichalik/ptu';

// The empty-result notice is driven by the core's own filter lifecycle events
// (typo3:tree:filter-applied / -reset), which the page tree only dispatches from
// v14 on; BackendAssetsListener therefore does not even publish the setting on
// v13. See Documentation/LIMITATIONS.md.
test.skip(resolveTypo3Version() === '13', 'The empty-result notice is a v14-only feature.');

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('a filter matching nothing shows the empty notice', async ({ page }) => {
  const tree = new PageTreePage(page);

  await searchTree(page, tree, NO_MATCH_TOKEN);

  const notice = page.locator('.pagetree-facets-empty');
  await expect(notice).toBeVisible();
  await expect(notice.locator('.pagetree-facets-empty__text')).toHaveText(
    'No pages match the current filter.',
  );
  // role="status" so screen readers announce it without stealing focus.
  await expect(notice).toHaveAttribute('role', 'status');
});

test('the reset action clears the filter and restores the tree', async ({ page }) => {
  const tree = new PageTreePage(page);
  const notice = page.locator('.pagetree-facets-empty');

  await searchTree(page, tree, NO_MATCH_TOKEN);
  await expect(notice).toBeVisible();
  // Baseline, so the assertion after the reset is not vacuous: an empty result
  // strips the tree down to the site root, so even "Home" is gone. Verified live
  // against 14.3.5 - unfiltered renders [root, Home], doktype:99 renders [root].
  await expect(tree.node(DEMO_PAGES.home)).toHaveCount(0);

  await notice.getByRole('button', { name: 'Reset filter' }).click();

  await expect(notice).toHaveCount(0);
  await expect(tree.searchField()).toHaveValue('');
  // Back to the tree's default depth (root + "Home") - see the Global Constraints
  // note on collapsed trees. "Home" reappearing is what proves the tree rebuilt.
  await expect(tree.node(DEMO_PAGES.home)).toBeVisible();
});

test('the adjust action reopens the modal on the failing phrase', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);
  const notice = page.locator('.pagetree-facets-empty');

  await searchTree(page, tree, NO_MATCH_TOKEN);
  await expect(notice).toBeVisible();

  await notice.getByRole('button', { name: 'Adjust filter' }).click();

  await expect(modal.root()).toBeVisible();
  // The phrase that just failed is still there to be narrowed, not discarded.
  await expect(tree.searchField()).toHaveValue(NO_MATCH_TOKEN);
});
