import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { DEMO_PAGES } from '../support/demo-pages.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';
import { searchTree } from '../support/search-tree.js';

/**
 * The one thing neither PHP nor the JS unit suite can show: that the Label the
 * filter attaches server-side actually surfaces in the rendered tree, and only
 * on the pages that matched.
 *
 * A filtered tree always contains the rootline leading to a hit (see the
 * Global Constraints note), which is exactly what makes the marker necessary -
 * and what makes "Home" the natural negative case here.
 *
 * Verified against TYPO3 14.3.5: nodes are `div[role="treeitem"]` and carry the
 * marker as a `<span class="node-label">` with the label colour as an inline
 * background, plus every label's text appended to the node's `title` attribute
 * (`tree.js#getNodeTitle()`).
 */
test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('a matched page is marked, the rootline around it is not', async ({ page }) => {
  const tree = new PageTreePage(page);

  // doktype:3 has exactly one match in the demo content, so the rendered tree is
  // that page plus its rootline - a clean hit/ancestor pair in one screen.
  await searchTree(page, tree, 'doktype:3');

  const match = tree.node(DEMO_PAGES.externalLink);
  await expect(match).toBeVisible();
  await expect(match.locator('.node-label')).toHaveCount(1);
  // Same colour the core uses for its own "Search result" label (#F5A770).
  await expect(match.locator('.node-label')).toHaveCSS('background-color', 'rgb(245, 167, 112)');

  // "Home" is only rendered because the match hangs below it.
  await expect(tree.node(DEMO_PAGES.home)).toBeVisible();
  await expect(tree.node(DEMO_PAGES.home).locator('.node-label')).toHaveCount(0);
});

test('the marker names itself in the node tooltip', async ({ page }) => {
  const tree = new PageTreePage(page);

  await searchTree(page, tree, 'doktype:3');

  // The stripe carries no text of its own, so the tooltip is the only place the
  // marker can be read rather than guessed.
  await expect(tree.node(DEMO_PAGES.externalLink)).toHaveAttribute(
    'title',
    /Matches the filter/,
  );
});

test('the core title search keeps its own marker instead of ours', async ({ page }) => {
  const tree = new PageTreePage(page);

  // A phrase without keyed tokens never reaches our engine, so the core's own
  // "Search result" label is what shows up - same stripe, different wording.
  await searchTree(page, tree, DEMO_PAGES.externalLink);

  const match = tree.node(DEMO_PAGES.externalLink);
  await expect(match.locator('.node-label')).toHaveCount(1);
  await expect(match).toHaveAttribute('title', /Search result/);
  await expect(match).not.toHaveAttribute('title', /Matches the filter/);
});
