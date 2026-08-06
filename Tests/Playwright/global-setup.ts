import { typo3Cli } from '@konradmichalik/ptu';

/**
 * `ddev install <version>` provisions the instance once: it requires the
 * fixture extensions under `Tests/Functional/Fixtures/Extensions/*`, updates
 * the schema/cache, and seeds the demo content (see
 * `.ddev/.setup/scripts/utils.sh`: `require_additional_extensions`,
 * `update_typo3`, `seed_demo_content`). This global setup does not repeat any
 * of that - it only re-seeds the demo content immediately before the suite
 * runs, so the fixture pages the specs assert against are in a known state
 * regardless of what an earlier test run, or manual poking around in the
 * backend, left behind.
 *
 * `pagetree-facets:seed-demo-content` is idempotent - it deletes the pages
 * from a prior run by title, then recreates them - which is what makes
 * re-seeding on every suite start safe.
 */
export default function globalSetup(): void {
  try {
    typo3Cli(['pagetree-facets:seed-demo-content']);
  } catch (error) {
    const stdout = error && typeof error === 'object' && 'stdout' in error ? String((error as { stdout: unknown }).stdout) : '';
    throw new Error(
      `pagetree-facets:seed-demo-content failed - has \`ddev install <version>\` provisioned this instance? ${stdout}`,
      { cause: error },
    );
  }
}
