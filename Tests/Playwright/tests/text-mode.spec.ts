import { test, expect, type Locator, type Page } from '@playwright/test';
import { BackendPage } from '@konradmichalik/ptu';
import { FacetsModalPage } from '../support/facets-modal.page.js';
import { waitForPageTreeReady } from '../support/wait-for-page-tree-ready.js';

/*
 * Text mode: the coloured phrase, the short reference in place of the chips
 * and the suggestions under the field. Covers what jsdom cannot: the mirror's
 * metrics, the colours against the field in both schemes, and real focus.
 */

test.beforeEach(async ({ page }) => {
  await new BackendPage(page).openModule('web/layout');
  await waitForPageTreeReady(page);
});

async function enterTextMode(page: Page, modal: FacetsModalPage): Promise<void> {
  await modal.open();
  await modal.navItem('doktype').click();
  await modal.option('doktype', 'doktype', '1').check();
  await modal.textSwitch().click();
  await expect(modal.tokenField()).toHaveValue('doktype:1');
}

/** WCAG contrast of two computed colours, `rgb(0-255 …)` or `color(srgb 0-1 …)` as Chromium resolves light-dark(). */
function contrast(foreground: string, background: string): number {
  const luminance = (colour: string) => {
    const scale = colour.startsWith('color(') ? 1 : 255;
    const [r, g, b] = colour.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((channel) => {
      const c = channel / scale;

      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);

  return (light + 0.05) / (dark + 0.05);
}

const colourOf = (locator: Locator, property: string) => locator.evaluate(
  (element, name) => getComputedStyle(element).getPropertyValue(name),
  property,
);

test('colours each key in the phrase with the mirror sharing the input\'s metrics', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await enterTextMode(page, modal);

  await expect(modal.phraseKeys()).toHaveText(['doktype:']);
  await expect(modal.phraseMirror()).toHaveText('doktype:1');

  // The mirror copies what decides where a character lands, so the caret in the
  // (transparent) input sits exactly over the coloured text.
  const metrics = ['font-family', 'font-size', 'padding-left'];
  for (const metric of metrics) {
    expect(await colourOf(modal.phraseMirror().locator('.pagetree-facets__phrase-text'), metric))
      .toBe(await colourOf(modal.tokenField(), metric));
  }
  expect(await colourOf(modal.tokenField(), 'color')).toBe('rgba(0, 0, 0, 0)');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the key colour clears 4.5:1 against the field in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const modal = new FacetsModalPage(page);
    await enterTextMode(page, modal);

    const key = await colourOf(modal.phraseKeys().first(), 'color');
    const field = await colourOf(page.locator('typo3-backend-modal .pagetree-facets__search-field'), 'background-color');

    expect(contrast(key, field), `${key} on ${field}`).toBeGreaterThanOrEqual(4.5);
  });
}

test('replaces the chips by the short reference, whose link opens the help', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await enterTextMode(page, modal);

  await expect(modal.reference()).toBeVisible();
  await expect(modal.chips()).toHaveCount(1);
  await expect(modal.chips().first()).toBeHidden();
  await expect(modal.clearAllButton()).toBeHidden();
  await expect(modal.moreButton()).toBeHidden();
  await expect(modal.reference().locator('.pagetree-facets__reference-item')).toHaveText([
    'key:value one criterion',
    'space all must match',
    '1,3 any of these',
    'Text without key searches title and UID',
  ]);

  await modal.reference().locator('.pagetree-facets__reference-link').click();

  await expect(modal.helpPopover()).toBeVisible();
});

test('suggests the keys while a word is typed, each with its label', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await enterTextMode(page, modal);

  await modal.tokenField().press('End');
  await modal.tokenField().pressSequentially(' i');

  await expect(modal.suggestions()).toBeVisible();
  await expect(modal.suggestionHeading()).toHaveText('Keys');
  await expect(modal.suggestionOptions().first()).toHaveText('isPage state');
  // The list hangs under the field, starting where the word does.
  const field = await modal.tokenField().boundingBox();
  const list = await modal.suggestions().boundingBox();
  expect(list!.y).toBeGreaterThanOrEqual(field!.y + field!.height);
  expect(list!.x).toBeGreaterThan(field!.x + 40);
});

test('suggests the values of a key after its colon; a picked one reaches the form', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await enterTextMode(page, modal);

  await modal.tokenField().press('End');
  await modal.tokenField().pressSequentially(' is:');
  await expect(modal.suggestionHeading()).toHaveText('Page state · is:');
  await modal.tokenField().press('ArrowDown');
  const picked = await modal.suggestions().locator('.is-highlighted .pagetree-facets__suggestion-token').textContent();

  await modal.tokenField().press('Enter');

  await expect(modal.tokenField()).toHaveValue(`doktype:1 is:${picked} `);
  await expect(modal.suggestions()).toBeHidden();
  await expect(modal.phraseKeys()).toHaveText(['doktype:', 'is:']);
  // Enter inserted instead of applying: the modal is still open and the form followed.
  await expect(modal.root()).toBeVisible();
  await expect(modal.option('state', 'is', picked!)).toBeChecked();
});

test('Escape closes the suggestions and leaves the modal open', async ({ page }) => {
  const modal = new FacetsModalPage(page);
  await enterTextMode(page, modal);
  await modal.tokenField().press('End');
  await modal.tokenField().pressSequentially(' is:');
  await expect(modal.suggestions()).toBeVisible();

  await modal.tokenField().press('Escape');

  await expect(modal.suggestions()).toBeHidden();
  await expect(modal.root()).toBeVisible();
});

test('forced colours drop the mirror, since the input\'s text is forced visible there', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const modal = new FacetsModalPage(page);
  await enterTextMode(page, modal);

  await expect(modal.phraseMirror()).toBeHidden();
  await expect(modal.tokenField()).toBeVisible();
});
