import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

/*
 * Unit tests for the extension's frontend modules.
 *
 * The modules under test are plain ES modules shipped as-is to the browser (see
 * Configuration/JavaScriptModules.php) - there is no build step, so tests import
 * exactly the files the backend loads.
 *
 * Two things this harness deliberately does NOT try to cover, because a stub can
 * only ever confirm what its author already believed about TYPO3 core:
 * whether core's own events behave as assumed (e.g. that typo3-modal-hide is
 * cancelable), and anything to do with real focus order or rendering - jsdom
 * implements neither sequential focus navigation nor layout. Those belong in
 * browser-driven tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the importmap prefix, so tests and the backend refer to the
      // modules by the same specifier.
      '@konradmichalik/pagetree-facets/': path('./Resources/Public/JavaScript/'),
    },
  },
  test: {
    // The modules are DOM code; pure-logic modules simply ignore the environment.
    environment: 'jsdom',
    include: ['Tests/JavaScript/**/*.test.js'],
    coverage: {
      include: ['Resources/Public/JavaScript/**/*.js'],
      // Alongside the PHP reports, and inside the already-ignored build dir.
      reportsDirectory: '.Build/coverage/javascript',
    },
  },
});
