import { test, expect } from '@playwright/test';
import { BackendPage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

/*
 * The criterion search in the navigation and its grouped result view. Covers
 * what jsdom cannot: the marks painted over the matched text in both colour
 * modes, real focus, and Escape reaching the field before the modal.
 */

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('matches are grouped by facet with the query marked, counted in the heading and in the navigation', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await expect(modal.searchField()).toHaveAttribute('placeholder', 'Find a criterion');
  await modal.searchField().fill('hidden');

  await expect(modal.searchResults()).toBeVisible();
  await expect(modal.searchHeading()).toHaveText(/^\d+ criteria match “hidden”$/);
  await expect(modal.searchHeading()).toHaveAttribute('aria-live', 'polite');
  await expect(modal.panel('doktype')).toBeHidden();
  // "Hidden" and "Hidden in menu" both live in Page state.
  const group = modal.searchResults().locator('.pagetree-facets__search-group', { hasText: 'Page state' });
  await expect(group.locator('mark')).toHaveText(['Hidden', 'Hidden']);
  await expect(modal.navMatches('state')).toHaveText('2');
  await expect(modal.navItem('doktype')).toHaveClass(/is-unmatched/);
  await expect(modal.navCount('state')).toHaveCount(0);
  await expect(modal.searchResults().locator('.pagetree-facets__search-scope'))
    .toHaveText('Only the criteria are searched here. To find a page by its title, use the field at the top.');

  // The mark is a tint under the base text colour, not a colour of its own.
  const [markBackground, labelBackground, markColor, labelColor] = await group.locator('mark').first().evaluate((mark) => {
    const label = mark.closest('.pagetree-facets__search-result-label')!;
    return [
      getComputedStyle(mark).backgroundColor, getComputedStyle(label).backgroundColor,
      getComputedStyle(mark).color, getComputedStyle(label).color,
    ];
  });
  expect(markBackground).not.toBe(labelBackground);
  expect(markColor).toBe(labelColor);
});

test('a match is a proxy for the real control, and Show all in opens its facet', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.searchField().fill('hidden');
  const group = modal.searchResults().locator('.pagetree-facets__search-group', { hasText: 'Page state' });

  // By the visible label alone: the row's text also holds the hidden description.
  const hiddenRow = group.locator('.pagetree-facets__search-result', {
    has: page.locator('.pagetree-facets__search-result-label', { hasText: /^Hidden$/ }),
  });
  await hiddenRow.locator('input').check();

  await expect(modal.chips()).toHaveCount(1);
  expect(await modal.chipLabels()).toEqual(['Page state: Hidden']);
  await expect(modal.option('state', 'is', 'hidden')).toBeChecked();

  await group.locator('.pagetree-facets__search-show-all').click();

  await expect(modal.searchResults()).toBeHidden();
  await expect(modal.searchField()).toHaveValue('');
  await expect(modal.panel('state')).toBeVisible();
  await expect(modal.navItem('state')).toHaveAttribute('aria-current', 'true');
  await expect(modal.navMatches('state')).toHaveCount(0);
});

test('Escape clears the search and returns to the facet that was open, leaving the modal open', async ({ page }) => {
  const modal = new FacetsModalPage(page);

  await modal.open();
  await modal.navItem('doktype').click();
  await modal.searchField().fill('hidden');
  await expect(modal.panel('doktype')).toBeHidden();

  await modal.searchField().press('Escape');

  await expect(modal.searchField()).toHaveValue('');
  await expect(modal.searchResults()).toBeHidden();
  await expect(modal.panel('doktype')).toBeVisible();
  await expect(modal.navItem('doktype')).toHaveAttribute('aria-current', 'true');
  await expect(modal.root()).toBeVisible();
  await expect(modal.searchField()).toBeFocused();
});

test('the marks stay visible under forced colours', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await page.emulateMedia({ forcedColors: 'active' });

  await modal.open();
  await modal.searchField().fill('hidden');

  const mark = modal.searchResults().locator('mark').first();
  await expect(mark).toBeVisible();
  const [markBackground, labelBackground] = await mark.evaluate((element) => [
    getComputedStyle(element).backgroundColor,
    getComputedStyle(element.closest('.pagetree-facets__search-result-label')!).backgroundColor,
  ]);
  expect(markBackground).not.toBe(labelBackground);
  expect(markBackground).not.toBe('rgba(0, 0, 0, 0)');
});
