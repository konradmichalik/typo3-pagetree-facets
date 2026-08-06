import { defineTypo3PlaywrightConfig } from '@konradmichalik/ptu';

/*
 * Third test layer, alongside PHPUnit and the Vitest/jsdom suite in
 * Tests/JavaScript. It covers exactly what those cannot: the real round trip
 * from the browser through the AJAX endpoints and PageTreeFilterListener to the
 * page tree the backend actually renders - plus real focus order, layout and
 * core's own event semantics, which jsdom does not implement.
 *
 * globalSetup is spread on afterwards rather than passed into the factory: it is
 * repository-specific (fixture extensions, demo content), so it has no place in
 * a TYPO3-generic package's option surface.
 */
export default {
  ...defineTypo3PlaywrightConfig({
    hostname: 'pagetree-facets.ddev.site',
    defaultVersion: '14',
    testDir: './Tests/Playwright',
  }),
  globalSetup: './Tests/Playwright/global-setup.ts',
};
