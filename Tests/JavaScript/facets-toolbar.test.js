import { describe, it } from 'vitest';

/*
 * facets-toolbar.js's #extractSharedFilter()/#scrubShareParam() (the "copy link"
 * read-back and scrub - see the class docblock) cannot be imported here, in this
 * harness, as it stands.
 *
 * The file's very first import is `import Hotkeys from '@typo3/backend/hotkeys.js'`,
 * a bare specifier with no vitest.config.js alias (unlike the one that already
 * exists for '@typo3/core/ajax/ajax-request.js', which favorites.test.js relies
 * on) and no real package on disk. Vite resolves every static import of a module
 * before any vi.mock() interception gets a say - confirmed directly: mocking that
 * exact specifier with a factory, whether the import is dynamic, static in the
 * test file, or static in a separate helper module, still fails at
 * vite:import-analysis with "Failed to resolve import ... Does the file exist?",
 * because there is nothing for it to resolve to. Every other file this module
 * pulls in (facets-modal.js -> @typo3/backend/modal.js, notification.js,
 * enum/severity.js) hits the same wall the moment it's reached.
 *
 * The one fix that would work - adding an alias for '@typo3/backend/hotkeys.js'
 * to vitest.config.js, mirroring the existing ajax-request.js entry - is out of
 * scope for this change. Until that alias exists, the extraction/scrubbing
 * behaviour is exercised only by Tests/Playwright/tests/share-link.spec.ts,
 * which is also the only place that can prove the part jsdom cannot run at all:
 * that the scrub survives TYPO3's own module router reconstructing the URL from
 * `redirectParams` after the fact (see the #scrubShareParam docblock).
 */
describe('facets-toolbar.js: extractSharedFilter/scrubShareParam', () => {
  it.todo('reads the phrase from a direct pagetreeFacetsFilter param and scrubs it from the URL');
  it.todo('reads the phrase nested inside redirectParams (fresh deep link) and scrubs it once resolvable');
  it.todo('re-scrubs after the module router rebuilds the URL from redirectParams (typo3-module-loaded)');
});
