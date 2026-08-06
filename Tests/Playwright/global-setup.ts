import { execFileSync } from 'node:child_process';
import { typo3BinPath, typo3Cli } from '@konradmichalik/ptu';

const FIXTURE_PACKAGES = [
  'konradmichalik/pagetree-facets-demo-content',
  'konradmichalik/pagetree-facets-example-tab',
];

/**
 * `ddev install <version>` symlinks the fixture extensions into the instance's
 * packages/ directory but does NOT add them to its composer.json require section,
 * so neither the seed command nor the third-party `example` tab exists until they
 * are required explicitly. Verified live: without this the seed command fails with
 * "There are no commands defined in the pagetree-facets namespace."
 *
 * Both this and the seed command are idempotent, so running them on every suite
 * start is cheap insurance against a half-prepared instance.
 */
export default function globalSetup(): void {
  const instanceDir = typo3BinPath().replace(/\/vendor\/bin\/typo3$/, '');

  execFileSync(
    'composer',
    ['require', ...FIXTURE_PACKAGES.map((name) => `${name}:*@dev`), '--no-interaction', '--no-progress'],
    { cwd: instanceDir, stdio: 'inherit' },
  );

  typo3Cli(['extension:setup']);
  typo3Cli(['cache:flush']);
  typo3Cli(['pagetree-facets:seed-demo-content']);
}
