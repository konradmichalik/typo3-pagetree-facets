import { test, expect } from '@playwright/test';
import { BackendPage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

/*
 * The warning under the criteria row while the live count is 0 (see
 * Filter/no-match-callout.js), driven by the real count endpoint.
 */

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('a selection no page matches shows the warning, which goes again once one criterion is removed', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await expect(modal.noMatchCallout()).toBeHidden();
  // The only external link is not hidden, so both together match nothing.
  await modal.navItem('doktype').click();
  await modal.option('doktype', 'doktype', '3').check();
  await modal.navItem('state').click();
  await modal.option('state', 'is', 'hidden').check();

  await expect(modal.countText()).toHaveText('No matching pages');
  const callout = modal.noMatchCallout();
  await expect(callout).toBeVisible();
  await expect(callout.locator('.pagetree-facets__no-match-title')).toHaveText('No page matches all 2 criteria');
  await expect(callout.locator('.pagetree-facets__no-match-text'))
    .toHaveText('Every criterion has to match at once. Remove one with its × above, or widen it in its category. The count below updates right away.');
  await expect(callout.locator('button')).toHaveCount(0);
  await expect(callout).not.toHaveAttribute('aria-live', /.*/);
  await expect(callout).toHaveClass(/alert-warning/);
  await expect(modal.applyButton()).toBeEnabled();
  // Right under the criteria row, above the navigation and the panel.
  const [calloutBox, rowBox, navBox] = await Promise.all([
    callout.boundingBox(), modal.criteriaRow().boundingBox(), page.locator('typo3-backend-modal .pagetree-facets__nav').boundingBox(),
  ]);
  expect(calloutBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height);
  expect(navBox!.y).toBeGreaterThanOrEqual(calloutBox!.y + calloutBox!.height);

  await modal.chips().first().locator('.pagetree-facets__chip-remove').click();

  await expect(modal.countText()).toHaveText(/^\d+ matching page/);
  await expect(callout).toBeHidden();
});
