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
  // The option label comes straight from core TCA, which renamed doktype 3 from
  // "Link to External URL" (v13) to "Link" (v14) - so the chip is asserted on
  // the part this extension actually produces: the facet prefix and the option
  // it stands for.
  expect(await modal.chipLabels()).toHaveLength(1);
  expect((await modal.chipLabels())[0]).toMatch(/^Page type: Link/);
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

test('the footer status shows the tip until a criterion is picked, then the count with the pending notice', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  // No criteria yet - the status offers the shortcut instead of a count.
  await expect(modal.status()).toContainText('Tip: open this dialog from anywhere with');
  await expect(modal.status().locator('kbd')).toHaveCount(3);
  await expect(modal.countText()).toBeHidden();

  await modal.navItem('doktype').click();
  // doktype 3 ("Link") matches only the one external-link fixture page.
  await modal.option('doktype', 'doktype', '3').check();

  // The count and the pending notice share one line. Waiting for the known
  // first result, not just visibility, keeps firstText from capturing a stale
  // value instead of doktype:3's real "1 matching page".
  await expect(modal.countText()).toHaveText('1 matching page');
  await expect(modal.status()).toContainText('1 matching page · not applied to the tree yet');
  const firstText = await modal.countText().textContent();

  // doktype 1 ("Page") is the common type across the seeded demo content, so
  // it necessarily produces a different (larger) count than doktype 3.
  await modal.option('doktype', 'doktype', '3').uncheck();
  await modal.option('doktype', 'doktype', '1').check();

  // Requiring visibility and the real label pattern first, not just "not
  // firstText", rules out a broken update path landing on some other wrong
  // value (e.g. the null-count label) and having that count as "changed".
  await expect(modal.countText()).toBeVisible();
  await expect(modal.countText()).toHaveText(/matching page/);
  await expect(modal.countText()).not.toHaveText(firstText ?? '');
});

test('Clear all appears with the first criterion and clears the selection without leaving the modal', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await expect(modal.clearAllButton()).toBeHidden();

  await modal.navItem('doktype').click();
  // doktype 3 is "Link" in this instance's TCA - same fixture value the
  // other tests in this file already rely on.
  await modal.option('doktype', 'doktype', '3').check();
  await expect(modal.clearAllButton()).toBeVisible();

  await modal.clearAllButton().click();

  await expect(modal.option('doktype', 'doktype', '3')).not.toBeChecked();
  await expect(modal.chips()).toHaveCount(0);
  await expect(modal.clearAllButton()).toBeHidden();
  await expect(modal.root()).toBeVisible();
});

test('the footer Cancel button carries no icon, Apply renders its check as a real, resolved icon', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();

  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toHaveClass(/btn-default/);
  await expect(cancel.locator('typo3-backend-icon')).toHaveCount(0);

  const applyIcon = modal.applyButton().locator('typo3-backend-icon');
  await expect(applyIcon).toHaveAttribute('identifier', 'actions-check');
  await expect(applyIcon.locator('svg')).toHaveCount(1);
});

test('the active facet is marked by more than a tint', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();

  // A tint alone is a weak cue and disappears in forced-colors mode. A border
  // stays, so the current facet is told apart without relying on colour.
  const active = page.locator('typo3-backend-modal .pagetree-facets__nav-item.active');
  await expect(active).toHaveCSS('border-inline-start-width', '3px');
  await expect(active).toHaveCSS('border-inline-start-style', 'solid');
});

test('a facet without options keeps readable text instead of being dimmed further', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();

  // Translations has no options on this single-language instance. The muted text
  // colour already marks it as unavailable; an extra opacity on top of that took
  // the label below the 4.5:1 the design rules ask for.
  const unavailable = page.locator('typo3-backend-modal .pagetree-facets__nav-item.is-empty').first();
  await expect(unavailable).toBeDisabled();
  await expect(unavailable).toHaveCSS('opacity', '1');
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
  const skeleton = page.locator('typo3-backend-modal .pagetree-facets__status-skeleton');
  await skeleton.evaluate((el) => { el.hidden = false; });

  const backgroundColor = await skeleton.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
});

