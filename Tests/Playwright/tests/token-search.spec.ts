import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { DEMO_PAGES } from '../support/fixtures.js';

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
});

test('a keyed token typed into the tree search narrows the tree', async ({ page }) => {
  const tree = new PageTreePage(page);

  await tree.search('doktype:3');

  // "Partner Website" is the only doktype-3 page in the fixture set.
  await expect(tree.node(DEMO_PAGES.externalLink)).toBeVisible();
  // Negative assertions matter more than the positive one here: an unfiltered
  // tree would also show the match.
  await expect(tree.node(DEMO_PAGES.contact)).toHaveCount(0);
  await expect(tree.node(DEMO_PAGES.products)).toHaveCount(0);
});

test('the rootline of a match stays visible as context', async ({ page }) => {
  const tree = new PageTreePage(page);

  await tree.search('doktype:3');

  await expect(tree.node(DEMO_PAGES.externalLink)).toBeVisible();
  // The parent is deliberately kept - a match would otherwise be unreachable in
  // the tree. Asserted explicitly so a future change to this behaviour is caught
  // here rather than silently breaking every other spec's assumptions.
  await expect(tree.node(DEMO_PAGES.home)).toBeVisible();
});

test('clearing the search removes the filter', async ({ page }) => {
  const tree = new PageTreePage(page);

  await tree.search('doktype:3');
  await expect(tree.node(DEMO_PAGES.externalLink)).toBeVisible();

  await tree.clear();

  // The unfiltered tree sits at its default depth - a vanilla v14 tree does not
  // auto-expand "Home", so its children are simply not rendered. The filter's
  // *effect* disappearing is therefore what proves the reset, not other pages
  // appearing: filtering is what expanded the tree down to the match in the
  // first place.
  await expect(tree.searchField()).toHaveValue('');
  await expect(tree.node(DEMO_PAGES.externalLink)).toHaveCount(0);
  await expect(tree.node(DEMO_PAGES.home)).toBeVisible();
});
