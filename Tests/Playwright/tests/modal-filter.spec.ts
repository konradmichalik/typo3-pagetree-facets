import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { DEMO_PAGES } from '../support/demo-pages.js';
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

test('the live match count stays hidden until a criterion is picked, then updates as the selection changes', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  // No criteria yet - showing a count for an unfiltered tree isn't useful, so
  // the notice stays hidden until the first facet is picked.
  await expect(modal.matchCount()).toBeHidden();

  await modal.navItem('doktype').click();
  // doktype 3 ("Link") matches only the one external-link fixture page.
  await modal.option('doktype', 'doktype', '3').check();

  await expect(modal.matchCount()).toBeVisible();
  const firstText = await modal.matchCount().textContent();

  // doktype 1 ("Page") is the common type across the seeded demo content, so
  // it necessarily produces a different (larger) count than doktype 3.
  await modal.option('doktype', 'doktype', '3').uncheck();
  await modal.option('doktype', 'doktype', '1').check();

  await expect(modal.matchCount()).not.toHaveText(firstText ?? '');
});

test('the footer Reset button renders its icon, is gated like Apply, and clears the selection', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await expect(modal.resetButton().locator('typo3-backend-icon')).toHaveCount(1);
  await expect(modal.resetButton()).toBeDisabled();

  await modal.navItem('doktype').click();
  // doktype 3 is "Link" in this instance's TCA - same fixture value the
  // other tests in this file already rely on.
  await modal.option('doktype', 'doktype', '3').check();
  await expect(modal.resetButton()).toBeEnabled();

  await modal.resetButton().click();

  await expect(modal.option('doktype', 'doktype', '3')).not.toBeChecked();
  await expect(modal.chips()).toHaveCount(0);
  await expect(modal.resetButton()).toBeDisabled();
});

test('the loading skeleton renders with a real, visible color', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();

  // The skeleton bar is normally revealed only once a count request has been
  // in flight past its delay threshold - a real local backend usually
  // resolves faster than that, so forcing it visible directly is the only
  // way to test the CSS rule's own correctness deterministically (a jsdom
  // unit test cannot: jsdom does not resolve CSS custom-property scoping the
  // way a real browser does, which is exactly how this bug slipped past 236
  // passing unit tests - the bar was fully transparent in the real backend).
  const skeleton = page.locator('typo3-backend-modal .pagetree-facets__match-count-skeleton');
  await skeleton.evaluate((el) => { el.hidden = false; });

  const backgroundColor = await skeleton.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
});

