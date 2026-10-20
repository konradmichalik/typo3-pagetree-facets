import { test, expect, type Page } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { DEMO_PAGES } from '../support/demo-pages.js';
import { searchTree } from '../support/search-tree.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

/*
 * The toolbar between the modal header and the body: the search field with its
 * Text switch and the criteria row with the scope chip. Covers what jsdom
 * cannot: the real page tree handing over the open page, real focus, and the
 * round trip of a scope through the serializer into the tree's search field.
 */

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

/**
 * Opens "Home" in the module. The toolbar reads the open page from the `id`
 * parameter of the outer URL, which the module router sets once a node is
 * selected; without it there is no page to scope to and (on this single-site
 * instance) no scope chip at all.
 */
async function openHome(page: Page): Promise<void> {
  await new PageTreePage(page).node(DEMO_PAGES.home).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('id')).toBe('1');
}

test('the empty criteria row names what to do, with the scope chip ahead of it', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await openHome(page);
  await modal.open();

  await expect(modal.criteriaRow()).toHaveClass(/is-empty/);
  await expect(modal.emptyState()).toHaveText('Nothing picked yet. Choose a category on the left or type a page title above.');
  await expect(modal.moreButton()).toBeHidden();
  // Opened from the page tree's "Home" node, so there is a page to scope to.
  await expect(modal.scopeChip()).toBeVisible();
  await expect(modal.scopeChip()).toContainText('In: Whole tree');
});

test('the scope chip offers the open page by its title and the choice lands in the phrase', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);

  await openHome(page);
  await modal.open();
  await modal.scopeChip().click();

  const list = page.locator('typo3-backend-modal .pagetree-facets__scope-list');
  await expect(list).toBeVisible();
  await expect(list).toBeFocused();
  await expect(list.locator('[role="option"]').first()).toHaveText('Whole tree');
  await expect(list.locator('[role="option"]').nth(1)).toHaveText(`Below "${DEMO_PAGES.home}" [1]`);

  await list.locator('[role="option"]').nth(1).click();

  await expect(modal.scopeChip()).toContainText(`In: Below "${DEMO_PAGES.home}" [1]`);
  await expect(modal.scopeChip()).toBeFocused();
  await expect(modal.applyButton()).toBeEnabled();
  await modal.apply();

  await expect(tree.searchField()).toHaveValue('under:1');
});

test('the scope list is keyboard operable and Escape closes it without a change', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await openHome(page);
  await modal.open();
  await modal.scopeChip().focus();
  await page.keyboard.press('ArrowDown');

  const list = page.locator('typo3-backend-modal .pagetree-facets__scope-list');
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');

  await expect(list).toBeHidden();
  await expect(modal.scopeChip()).toBeFocused();
  await expect(modal.scopeChip()).toContainText('In: Whole tree');
  // The modal itself stays open: the Escape was consumed by the list.
  await expect(modal.root()).toBeVisible();
});

test('the page title becomes a chip, and the Text switch shows the whole phrase', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);

  await openHome(page);
  await searchTree(page, tree, 'doktype:3 partner');
  await modal.open();

  // The chips are derived once the modal reports itself shown, after the root
  // is visible - so wait for them rather than reading the labels right away.
  await expect(modal.chips()).toHaveCount(2);
  expect(await modal.chipLabels()).toContain('Title: partner');
  await expect(modal.textSwitch()).toHaveText('Text');
  await expect(modal.textSwitch()).toHaveAttribute('aria-pressed', 'false');

  await modal.textSwitch().click();

  await expect(modal.textSwitch()).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.tokenField()).toBeVisible();
  await expect(modal.tokenField()).toBeFocused();
  await expect(modal.tokenField()).toHaveValue('doktype:3 partner');
  await expect(modal.freetextField()).toBeHidden();
  await expect(modal.scopeChip()).toBeHidden();
});

test('the actions menu opens the name form under the row and saves a favorite', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('doktype').click();
  await modal.option('doktype', 'doktype', '3').check();

  const item = await modal.menuItem('Save as favorite');
  await expect(item).toBeFocused();
  await item.click();

  const form = page.locator('typo3-backend-modal .pagetree-facets__favorite-form');
  await expect(form).toBeVisible();
  await expect(form.locator('input')).toBeFocused();
  await form.locator('input').fill('Links only');
  await page.keyboard.press('Enter');

  await expect(form).toBeHidden();
  await expect(modal.moreButton()).toBeFocused();
  await expect(modal.navItem('__favorites')).toBeVisible();
  // Tidy up: the favorite lives in the backend user's uc and would outlive the test.
  await modal.navItem('__favorites').click();
  await page.locator('typo3-backend-modal .pagetree-facets__favorite-remove').first().click();
  await expect(page.locator('typo3-backend-modal .pagetree-facets__favorite')).toHaveCount(0);
});
