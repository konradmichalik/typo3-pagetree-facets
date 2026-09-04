import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { DEMO_PAGES } from '../support/demo-pages.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';
import { searchTree } from '../support/search-tree.js';
import { resolveTypo3Version } from '@konradmichalik/ptu';

const IS_V13 = resolveTypo3Version() === '13';

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
 *
 * v13 renders the same markup but differs twice, both of which show up here:
 * an unmarked node carries a transparent placeholder label instead of none (the
 * only way to stop v13's unconditional label inheritance - see
 * SearchResultLabelListener), and the core has no search-result marker of its
 * own to compare against, because PageTreeFilter is a v14 class.
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
  const rootline = tree.node(DEMO_PAGES.home);
  await expect(rootline).toBeVisible();
  if (IS_V13) {
    // The placeholder that blocks v13's label inheritance: present in the DOM,
    // invisible on screen. Asserting it is transparent is what proves the
    // rootline is not being marked.
    await expect(rootline.locator('.node-label')).toHaveCount(1);
    await expect(rootline.locator('.node-label')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  } else {
    await expect(rootline.locator('.node-label')).toHaveCount(0);
  }
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
  if (IS_V13) {
    // v13 has no search-result marker of its own (PageTreeFilter arrived with
    // v14), so there is no stripe to keep - what matters is that a core-only
    // search is left alone entirely, placeholder labels included.
    await expect(match.locator('.node-label')).toHaveCount(0);
  } else {
    await expect(match.locator('.node-label')).toHaveCount(1);
    await expect(match).toHaveAttribute('title', /Search result/);
  }
  await expect(match).not.toHaveAttribute('title', /Matches the filter/);
});
