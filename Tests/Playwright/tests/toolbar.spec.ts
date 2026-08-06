import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
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

  await expect(modal.badge()).toHaveCount(0);

  await tree.search('doktype:3');

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
