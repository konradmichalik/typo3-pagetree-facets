import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { DEMO_PAGES } from '../support/fixtures.js';
import { waitForTreeFilterApplied } from '../support/wait-for-tree-filter.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

const SHARE_PARAM = 'pagetreeFacetsFilter';

test.beforeEach(async ({ context, page, baseURL }) => {
  // #copyLink() writes through navigator.clipboard, which Chromium gates behind a
  // permission. Granting it lets the test read back exactly what a user would paste.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: baseURL ?? '',
  });
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

test('copy link puts the current phrase on the clipboard as a URL parameter', async ({ page }) => {
  const tree = new PageTreePage(page);
  const modal = new FacetsModalPage(page);

  await waitForTreeFilterApplied(page, () => tree.search('doktype:3'));
  await modal.open();
  await modal.copyLinkButton().click();

  // #copyLink() computes the phrase and writes to the clipboard through two
  // awaited async steps; the click only dispatches the event and does not
  // wait for that work to finish, so reading the clipboard once right after
  // the click races it. Poll for the write actually landing instead.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe('');

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(copied);

  expect(url.searchParams.get(SHARE_PARAM)).toBe('doktype:3');
});

test('opening a shared link applies the filter and scrubs the parameter', async ({ page }) => {
  const tree = new PageTreePage(page);

  await page.goto(`/typo3/module/web/layout?${SHARE_PARAM}=${encodeURIComponent('doktype:3')}`);

  await expect(tree.searchField()).toHaveValue('doktype:3');
  await expect(tree.node(DEMO_PAGES.externalLink)).toBeVisible();
  await expect(tree.node(DEMO_PAGES.contact)).toHaveCount(0);

  // The parameter is applied once and then removed, so a reload or a bookmarked
  // URL does not silently re-apply a stale filter.
  await expect.poll(() => new URL(page.url()).searchParams.get(SHARE_PARAM)).toBeNull();
});
