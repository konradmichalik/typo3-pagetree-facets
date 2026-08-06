import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { DEMO_PAGES } from '../support/fixtures.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('selecting an option in the modal filters the tree after apply', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('doktype').click();
  // doktype 3 is "Link" in this instance's TCA.
  await modal.option('doktype', 'doktype', '3').check();
  await modal.apply();

  await expect(tree.node(DEMO_PAGES.externalLink)).toBeVisible();
  await expect(tree.node(DEMO_PAGES.contact)).toHaveCount(0);
  // The modal and the raw token syntax are two views of the same state, so the
  // selection must have been written back into the tree's search field.
  await expect(tree.searchField()).toHaveValue('doktype:3');
});

test('a selected option shows up as an active-filter chip and a nav count', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('doktype').click();
  await modal.option('doktype', 'doktype', '3').check();

  await expect(modal.chips()).toHaveCount(1);
  expect(await modal.chipLabels()).toEqual(['Page type: Link']);
  await expect(modal.navCount('doktype')).toHaveText('1');
});

test('removing the chip clears the selection again', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('doktype').click();
  await modal.option('doktype', 'doktype', '3').check();
  await expect(modal.chips()).toHaveCount(1);

  await modal.chips().first().locator('.pagetree-facets__chip-remove').click();

  await expect(modal.chips()).toHaveCount(0);
  await expect(modal.option('doktype', 'doktype', '3')).not.toBeChecked();
});
