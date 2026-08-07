import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { DEMO_PAGES } from '../support/demo-pages.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';
import { searchTree } from '../support/search-tree.js';

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('a keyed token typed into the tree search narrows the tree', async ({ page }) => {
  const tree = new PageTreePage(page);

  await searchTree(page, tree, 'doktype:3');

  // "Partner Website" is the only doktype-3 page in the fixture set.
  await expect(tree.node(DEMO_PAGES.externalLink)).toBeVisible();
  // Negative assertions matter more than the positive one here: an unfiltered
  // tree would also show the match.
  await expect(tree.node(DEMO_PAGES.contact)).toHaveCount(0);
  await expect(tree.node(DEMO_PAGES.products)).toHaveCount(0);
});

test('the rootline of a match stays visible as context', async ({ page }) => {
  const tree = new PageTreePage(page);

  await searchTree(page, tree, 'doktype:3');

  await expect(tree.node(DEMO_PAGES.externalLink)).toBeVisible();
  // The parent is deliberately kept - a match would otherwise be unreachable in
  // the tree. Asserted explicitly so a future change to this behaviour is caught
  // here rather than silently breaking every other spec's assumptions.
  await expect(tree.node(DEMO_PAGES.home)).toBeVisible();
  // Without this, "Home" being visible would also be true of the unfiltered
  // tree, so the test would pass even if filtering were completely inert.
  // "Contact" (doktype 1, not a rootline ancestor of the match) proves the
  // tree is actually filtered, not merely rendered.
  await expect(tree.node(DEMO_PAGES.contact)).toHaveCount(0);
});

test('two tokens from different tabs intersect (AND), not union (OR)', async ({ page }) => {
  const tree = new PageTreePage(page);

  // "Archive" is the only page that is both doktype 1 AND is:hidden - see
  // SeedDemoContentCommand. "Products" matches doktype:1 alone (not hidden);
  // if the engine unioned tabs instead of intersecting them, it would appear
  // too. That is the assertion that actually proves cross-tab AND, which is
  // PageTreeFilterListener's central behaviour and otherwise untested by this
  // suite - every other spec exercises the doktype tab alone.
  await searchTree(page, tree, 'doktype:1 is:hidden');

  await expect(tree.node(DEMO_PAGES.archive)).toBeVisible();
  await expect(tree.node(DEMO_PAGES.products)).toHaveCount(0);
});

test('clearing the search removes the filter', async ({ page }) => {
  const tree = new PageTreePage(page);

  await searchTree(page, tree, 'doktype:3');
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
