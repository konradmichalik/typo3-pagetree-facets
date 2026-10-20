import { test, expect } from '@playwright/test';
import { BackendPage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

/*
 * One facet's panel: the heading with the facet name, its description and
 * Select none, and the dense layout of a large list. Covers what jsdom cannot:
 * the measured rows and columns, and the group headings staying in view while
 * the list scrolls.
 */

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('every panel is headed by the facet name and one sentence on what it matches', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('doktype').click();

  await expect(modal.panelTitle('doktype')).toHaveText('Page type');
  await expect(modal.panelDescription('doktype')).toHaveText('Show pages of the selected types. Several choices mean any of them.');
  // The single field would only repeat the heading, so its legend leaves the
  // screen but stays the fieldset's accessible name.
  await expect(modal.panel('doktype').locator('legend')).toHaveClass(/visually-hidden/);
  await expect(modal.panel('doktype').locator('fieldset')).toHaveAccessibleName('Page type');
});

test('Select none clears the panel it sits in and nothing else', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('doktype').click();
  await expect(modal.selectNoneButton('doktype')).toBeHidden();
  await modal.option('doktype', 'doktype', '1').check();
  await modal.navItem('state').click();
  await modal.option('state', 'is', 'hidden').check();
  await expect(modal.chips()).toHaveCount(2);

  await expect(modal.selectNoneButton('state')).toBeVisible();
  await modal.selectNoneButton('state').click();

  // "Standard Page" on v14, "Standard" on v13: core's own label for doktype 1.
  const labels = await modal.chipLabels();
  expect(labels).toHaveLength(1);
  expect(labels[0]).toMatch(/^Page type: Standard/);
  await expect(modal.navCount('state')).toHaveCount(0);
  await expect(modal.navCount('doktype')).toHaveText('1');
  await expect(modal.selectNoneButton('state')).toBeHidden();
  await expect(modal.applyButton()).toBeEnabled();
});

test('a large list gets dense rows in three columns and counts its selection', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('ce').click();

  const panel = modal.panel('ce');
  await expect(panel).toHaveClass(/is-dense/);
  const columns = await panel.locator('.pagetree-facets__options').first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(3);
  const row = await panel.locator('.form-check').first().boundingBox();
  expect(row!.height).toBe(32);

  const total = await panel.locator('input[type="checkbox"][name]').count();
  await expect(modal.panelCount('ce')).toHaveText(`0 of ${total} selected.`);
  await panel.locator('input[type="checkbox"][name]').nth(2).check();
  await expect(modal.panelCount('ce')).toHaveText(`1 of ${total} selected.`);
});

test('a group heading selects or clears its whole group', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('ce').click();

  const group = modal.panel('ce').locator('fieldset').nth(1);
  const toggle = group.locator('.pagetree-facets__group-toggle');
  const options = group.locator('input[name]');
  const size = await options.count();
  await expect(toggle).toHaveAccessibleName(/^Select all /);

  await options.first().check();
  await expect(toggle).toHaveJSProperty('indeterminate', true);

  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(modal.navCount('ce')).toHaveText(String(size));
  await expect(modal.applyButton()).toBeEnabled();

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(modal.chips()).toHaveCount(0);
});

test('the heading and the group headings stay in view while a large list scrolls', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('ce').click();

  const panel = modal.panel('ce');
  const fields = panel.locator('.pagetree-facets__panel-fields');
  const headingBefore = await panel.locator('.pagetree-facets__panel-heading').boundingBox();
  // Scroll a few rows into the tallest group: its legend has to stay at the
  // top edge of the list while its own rows are still below.
  const index = await fields.evaluate((el) => {
    const groups = [...el.querySelectorAll('fieldset')];
    const tallest = groups.reduce((best, group) => (group.offsetHeight > best.offsetHeight ? group : best), groups[0]);
    el.scrollTop = tallest.offsetTop + 50;

    return groups.indexOf(tallest);
  });

  const headingAfter = await panel.locator('.pagetree-facets__panel-heading').boundingBox();
  expect(headingAfter!.y).toBe(headingBefore!.y);
  const legend = await panel.locator('legend').nth(index).boundingBox();
  const list = await fields.boundingBox();
  expect(Math.abs(legend!.y - list!.y)).toBeLessThan(2);
});
