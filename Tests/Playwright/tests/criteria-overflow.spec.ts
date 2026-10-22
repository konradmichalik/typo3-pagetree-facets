import { test, expect, type Page } from '@playwright/test';
import { BackendPage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

/*
 * The `+N more` overflow of the criteria row (see Filter/criteria-overflow.js).
 * Covers what jsdom cannot: the real measured layout, where the fit decides
 * and nothing is clipped.
 */

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

/** Ticks every content element group, which yields more chips than two rows hold. */
async function pickEveryContentElement(page: Page, modal: FacetsModalPage): Promise<number> {
  await modal.open();
  await modal.navItem('ce').click();
  const toggles = modal.panel('ce').locator('.pagetree-facets__group-toggle');
  const count = await toggles.count();
  for (let index = 0; index < count; index++) {
    await toggles.nth(index).check();
  }
  const total = await modal.panel('ce').locator('input[type="checkbox"][name]').count();
  await expect(modal.chips()).toHaveCount(total);

  return total;
}

test('the row keeps to two rows of chips, the rest is counted on +N more, no chip is cut off', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  const total = await pickEveryContentElement(page, modal);

  await expect(modal.overflowButton()).toBeVisible();
  // One frame for every number, so a late re-measure cannot split them.
  const layout = await modal.criteriaRow().evaluate((row) => {
    const box = row.getBoundingClientRect();
    const chips = [...row.querySelectorAll('.pagetree-facets__chips > .pagetree-facets__chip')] as HTMLElement[];
    const visible = chips.filter((chip) => !chip.hidden);
    const tops = new Set(visible.map((chip) => Math.round(chip.getBoundingClientRect().top)));
    const cutOff = visible.some((chip) => {
      const rect = chip.getBoundingClientRect();
      return rect.right > box.right || rect.left < box.left;
    });
    const button = row.querySelector('.pagetree-facets__overflow-button') as HTMLElement;

    return {
      height: box.height,
      chipRows: tops.size,
      visible: visible.length,
      hidden: chips.length - visible.length,
      cutOff,
      buttonText: button.textContent,
      buttonRow: Math.round(button.getBoundingClientRect().top),
      rowTops: [...tops],
    };
  });

  expect(layout.hidden).toBeGreaterThan(0);
  expect(layout.chipRows).toBeLessThanOrEqual(2);
  // Two chip rows of 26px, the gap and the padding of the row.
  expect(layout.height).toBeLessThan(80);
  expect(layout.cutOff).toBe(false);
  expect(layout.buttonText).toBe(`+${layout.hidden} more`);
  expect(layout.rowTops).toContain(layout.buttonRow);
  expect(layout.visible + layout.hidden).toBe(total);
  await expect(modal.overflowButton()).toHaveAttribute('aria-label', `Show ${layout.hidden} more criteria`);
});

test('the popover lists every criterion grouped by facet, each with its own ×, and keeps focus on a removal', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  const total = await pickEveryContentElement(page, modal);

  await modal.overflowButton().click();

  const popover = modal.overflowPopover();
  await expect(popover).toBeVisible();
  await expect(popover).toHaveRole('dialog');
  await expect(popover).toHaveAccessibleName(`All ${total} criteria`);
  await expect(popover).toBeFocused();
  // Inside the modal content, not hanging off the row's end into the backdrop.
  const [popoverBox, rootBox] = await Promise.all([popover.boundingBox(), modal.root().boundingBox()]);
  expect(popoverBox!.x).toBeGreaterThanOrEqual(rootBox!.x);
  expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(rootBox!.x + rootBox!.width + 1);
  await expect(popover.locator('dt')).toHaveText(['Content elements']);
  const entries = popover.locator('.pagetree-facets__chip-remove');
  await expect(entries).toHaveCount(total);
  await expect(entries.first()).toHaveAccessibleName(/^Remove Content elements: /);

  await entries.nth(1).focus();
  await entries.nth(1).click();

  await expect(modal.chips()).toHaveCount(total - 1);
  await expect(entries).toHaveCount(total - 1);
  await expect(entries.nth(1)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(modal.overflowButton()).toBeFocused();
  await expect(modal.root()).toBeVisible();
});

test('the popover closes once Clear all empties the row', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await pickEveryContentElement(page, modal);

  await modal.overflowButton().click();
  await modal.overflowPopover().locator('.pagetree-facets__overflow-clear').click();

  await expect(modal.chips()).toHaveCount(0);
  await expect(modal.overflowPopover()).toBeHidden();
  await expect(modal.overflowButton()).toBeHidden();
  await expect(modal.criteriaRow()).toHaveClass(/is-empty/);
  // Focus never lands on the body.
  await expect(page.locator('body')).not.toBeFocused();
});
