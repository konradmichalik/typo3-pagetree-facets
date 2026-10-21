import { test, expect, type Locator } from '@playwright/test';
import { BackendPage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

/*
 * The help popover and the link that opens it. Covers what jsdom cannot: the
 * link really pinned to the navigation's bottom edge, the popover placed next
 * to the navigation, real focus, and every example token hydrating through
 * the real endpoints into a criterion.
 */

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('the help link is pinned to the bottom of the navigation, under the scrolling list', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();

  const nav = page.locator('typo3-backend-modal .pagetree-facets__nav');
  // Both edges in one frame: the modal may still be sliding in.
  const gap = await nav.evaluate((element, link) => Math.abs(
    link!.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom,
  ), await modal.helpLink().elementHandle());
  // Within the nav's own bottom padding, nothing scrolls between the two.
  expect(gap).toBeLessThan(8);
  // The list scrolls on its own, so the link stays however long the list gets.
  await expect(nav.locator('.pagetree-facets__nav-list')).toHaveCSS('overflow-y', 'auto');
  await expect(modal.page.locator('typo3-backend-modal .pagetree-facets__help-toggle')).toHaveCount(0);
});

test('the popover opens next to the navigation as a dialog, takes focus and gives it back', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.helpLink().click();

  const popover = modal.helpPopover();
  await expect(popover).toBeVisible();
  await expect(popover).toHaveRole('dialog');
  await expect(popover).toHaveAccessibleName('How filtering works');
  await expect(popover).toBeFocused();
  const navBox = await page.locator('typo3-backend-modal .pagetree-facets__nav').boundingBox();
  const popoverBox = await popover.boundingBox();
  expect(popoverBox!.x).toBeGreaterThanOrEqual(navBox!.x + navBox!.width);
  // Over the content, up into the toolbar, never pushing the panel down.
  const panelBox = await modal.panel('ce').boundingBox();
  expect(panelBox!.y).toBeLessThan(popoverBox!.y + popoverBox!.height);

  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(modal.helpLink()).toBeFocused();
  // Escape closed the popover only, not the modal.
  await expect(modal.root()).toBeVisible();

  await modal.helpLink().click();
  await popover.locator('.pagetree-facets__help-close').click();
  await expect(popover).toBeHidden();
  await expect(modal.helpLink()).toBeFocused();
});

test('forced colours give the example chips and the open link a border', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  // The tints are dropped here, so the chips and the open state need a border.
  await page.emulateMedia({ forcedColors: 'active' });

  await modal.open();
  const width = (locator: Locator, property: string) => locator.evaluate(
    (element, name) => parseFloat(getComputedStyle(element).getPropertyValue(name)),
    property,
  );
  const size = async (locator: Locator) => {
    const { width: w, height } = (await locator.boundingBox())!;

    return { width: w, height };
  };
  const linkBefore = await size(modal.helpLink());
  // Core's .btn already paints a thin border here, so the open state needs a thicker one.
  const closedBorder = await width(modal.helpLink(), 'border-top-width');

  await modal.helpLink().click();

  expect(await width(modal.helpLink(), 'border-top-width')).toBeGreaterThan(closedBorder);
  // The border takes its width from the padding, so the link does not grow.
  expect(await size(modal.helpLink())).toEqual(linkBefore);
  expect(await width(modal.helpPopover().locator('.pagetree-facets__help-chip').first(), 'border-top-width')).toBeGreaterThan(0);
});

test('every example token in the help hydrates into a criterion', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.helpLink().click();
  const tokens = await modal.helpPopover().locator('.pagetree-facets__help-tokens code').allTextContents();
  expect(tokens).toHaveLength(5);
  await page.keyboard.press('Escape');

  await modal.textSwitch().click();
  await modal.tokenField().fill(tokens.join(' '));

  // doktype:1,3 is two values, the other four one each.
  await expect(modal.chips()).toHaveCount(6);
  await expect(modal.navCount('doktype')).toHaveText('2');
  await expect(modal.navCount('state')).toHaveText('1');
  await expect(modal.navCount('ce')).toHaveText('1');
  await expect(modal.navCount('activity')).toHaveText('2');
});
