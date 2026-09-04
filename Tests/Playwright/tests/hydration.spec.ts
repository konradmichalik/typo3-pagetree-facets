import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { searchTree } from '../support/search-tree.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('an existing phrase hydrates the modal state', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);

  await searchTree(page, tree, 'doktype:3');
  await modal.open();

  await expect(modal.option('doktype', 'doktype', '3')).toBeChecked();
  await expect(modal.navCount('doktype')).toHaveText('1');
  // Prefix match rather than the full string: the option label is core TCA,
  // which renamed doktype 3 from "Link to External URL" (v13) to "Link" (v14).
  expect(await modal.chipLabels()).toHaveLength(1);
  expect((await modal.chipLabels())[0]).toMatch(/^Page type: Link/);
});

test('opening and closing the modal does not rewrite the phrase', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);

  await searchTree(page, tree, 'doktype:3');
  await modal.open();

  // Apply is deliberately disabled while nothing has changed (see
  // #refreshApplyState() in facets-modal.js - applying an unchanged filter is a
  // no-op). That is itself the guarantee this test wants: the modal offers no way
  // to silently rewrite a phrase the user did not touch.
  await expect(modal.applyButton()).toBeDisabled();

  await modal.close();

  await expect(tree.searchField()).toHaveValue('doktype:3');
});

test('hydrated state survives a modal edit, freetext included', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);

  await searchTree(page, tree, 'doktype:3 partner');
  await modal.open();

  await expect(modal.freetextField()).toHaveValue('partner');
  await expect(modal.option('doktype', 'doktype', '3')).toBeChecked();

  // Add a second page type. This is what makes the round trip provable: the
  // re-serialized phrase has to carry the hydrated doktype 3 and the freetext
  // alongside the new doktype 4. Had hydration dropped either, applying would
  // emit "doktype:4" alone.
  await modal.navItem('doktype').click();
  await modal.option('doktype', 'doktype', '4').check();
  await expect(modal.applyButton()).toBeEnabled();
  await modal.apply();

  // Values are serialized in the order the options appear in the tab, not in
  // selection order - the doktype field lists 4 before 3.
  await expect(tree.searchField()).toHaveValue('doktype:4,3 partner');
});
