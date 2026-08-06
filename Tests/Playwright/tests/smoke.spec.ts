import { test, expect } from '@playwright/test';
import { BackendPage, PageTreePage } from '@konradmichalik/ptu';

test('the backend page tree loads with the seeded demo content', async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  const tree = new PageTreePage(page);

  await expect(tree.searchField()).toBeVisible();
  await expect(tree.node('Home')).toBeVisible();
});
