import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';
import { searchTree } from '../support/search-tree.js';

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('the filter button is injected into the page tree toolbar', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);

  await expect(modal.toggleButton()).toBeVisible();
  // Merged into a button group with the tree's own search input, not appended
  // somewhere else on the page.
  await expect(tree.toolbar().locator('.pagetree-facets-toggle')).toHaveCount(1);
});

test('the button carries a badge with the active filter count', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);

  // The toggle button's own 'input' listener (which keeps the badge in sync -
  // see #injectButton() in facets-toolbar.js) is wired up asynchronously,
  // independently of the tree's own data load: #injectButton() polls for the
  // search field on its own schedule. Waiting for the button to exist first
  // guarantees that listener is already attached before the search below
  // dispatches its 'input' event - otherwise the badge only catches up once
  // #injectButton() itself finally succeeds, which can race the assertion
  // below under a loaded instance.
  await expect(modal.toggleButton()).toBeVisible();
  await expect(modal.badge()).toHaveCount(0);

  await searchTree(page, tree, 'doktype:3');

  await expect(modal.badge()).toHaveText('1');
});

test('the keyboard shortcut opens the modal', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.openViaShortcut();

  await expect(modal.root()).toBeVisible();
});

test('clicking the button opens the modal', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();

  await expect(modal.navItem('doktype')).toBeVisible();
});
