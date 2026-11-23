import { test, expect, type Page } from '@playwright/test';
import { BackendPage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

/*
 * The user autocomplete of the Activity facet against real be_users: the demo
 * editors seeded by `pagetree-facets:seed-demo-content`, one of them disabled.
 * Covers the request discipline (none for `Me`, one per settled query) and the
 * chip inside the field, which jsdom cannot lay out.
 */

const EDITED_BY = 'activity[by]';

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

/** Counts the requests to the users endpoint from now on. */
function countUserRequests(page: Page): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.url().includes('/pagetree-facets/users')) {
      count += 1;
    }
  });

  return () => count;
}

async function openActivity(page: Page, modal: FacetsModalPage): Promise<void> {
  await modal.open();
  await modal.navItem('activity').click();
  await expect(modal.userPickerInput(EDITED_BY)).toBeVisible();
}

test('offers Me first on focus, without a request', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  const requests = countUserRequests(page);
  await openActivity(page, modal);

  await modal.userPickerInput(EDITED_BY).focus();

  await expect(modal.userResults()).toBeVisible();
  await expect(modal.userOptions()).toHaveText(['Me (admin)']);
  await expect(modal.userHint()).toBeHidden();
  expect(requests()).toBe(0);
});

test('asks for one more character below two, Me still on offer', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  const requests = countUserRequests(page);
  await openActivity(page, modal);

  await modal.userPickerInput(EDITED_BY).pressSequentially('d');

  await expect(modal.userHint()).toHaveText('Type one more character to search users');
  await expect(modal.userOptions()).toHaveText(['Me (admin)']);
  expect(requests()).toBe(0);
});

test('searches from two characters with one request, marks the match and labels a disabled account', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  const requests = countUserRequests(page);
  await openActivity(page, modal);

  await modal.userPickerInput(EDITED_BY).pressSequentially('dora');

  const dora = modal.userOptions().filter({ hasText: 'Dora Former' });
  await expect(dora).toHaveCount(1);
  await expect(dora.locator('mark')).toHaveText(['Dora', 'dora']);
  await expect(dora.locator('.pagetree-facets__user-disabled')).toHaveText('Disabled');
  await expect(modal.userOptions().first()).toHaveText('Me (admin)');
  await expect(modal.userOptions().filter({ hasText: 'Anna Schmidt' })).toHaveCount(0);
  // The debounce folds the four keystrokes into one request.
  expect(requests()).toBe(1);
});

test('says that no user matches, naming the query, and keeps Me selectable', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await openActivity(page, modal);
  const input = modal.userPickerInput(EDITED_BY);

  await input.pressSequentially('zzz');

  await expect(modal.userHint()).toHaveText("No user matches 'zzz'");
  await expect(modal.userOptions()).toHaveText(['Me (admin)']);

  await input.press('ArrowDown');
  await input.press('Enter');

  await expect(modal.userPickerChip(EDITED_BY)).toHaveText(/Me \(admin\)/);
  await expect(modal.root()).toBeVisible();
});

test('shows the picked user as a chip inside the field, removable by its own ×', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await openActivity(page, modal);
  const input = modal.userPickerInput(EDITED_BY);

  await input.focus();
  await modal.userOptions().first().click();

  const chip = modal.userPickerChip(EDITED_BY);
  await expect(chip.locator('.pagetree-facets__chip-label')).toHaveText('Me (admin)');
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('placeholder', '');
  // The chip sits inside the field box, before the input.
  const box = await input.locator('..').boundingBox();
  const chipBox = await chip.boundingBox();
  expect(chipBox!.x).toBeGreaterThanOrEqual(box!.x);
  expect(chipBox!.x + chipBox!.width).toBeLessThanOrEqual(box!.x + box!.width);
  expect(await modal.chipLabels()).toContain('Edited by: Me (admin)');

  await chip.locator('.pagetree-facets__chip-remove').click();

  await expect(chip).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(modal.chips()).toHaveCount(0);
});

test('drops the chip in the field when the criteria row removes the criterion', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await openActivity(page, modal);
  await modal.userPickerInput(EDITED_BY).focus();
  await modal.userOptions().first().click();
  await expect(modal.userPickerChip(EDITED_BY)).toHaveCount(1);

  await modal.chips().first().locator('.pagetree-facets__chip-remove').click();

  await expect(modal.userPickerChip(EDITED_BY)).toHaveCount(0);
});
