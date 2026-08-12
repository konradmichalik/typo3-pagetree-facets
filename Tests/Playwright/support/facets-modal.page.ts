import { expect, type Locator, type Page } from '@playwright/test';

const MODAL = 'typo3-backend-modal';

/**
 * The pagetree-facets filter modal.
 *
 * Verified against TYPO3 14.3.5: the modal is a `typo3-backend-modal` element
 * rendering into light DOM, so ordinary locators reach its contents. The modal's
 * own markup is driven by each tab's declarative getModalConfiguration(), which
 * is why everything here addresses data attributes rather than structure.
 */
export class FacetsModalPage {
  constructor(private readonly page: Page) {}

  toggleButton(): Locator {
    return this.page.locator('.pagetree-facets-toggle');
  }

  /** Count of currently active filters, rendered onto the toolbar button. */
  badge(): Locator {
    return this.toggleButton().locator('.badge');
  }

  root(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets`);
  }

  async open(): Promise<void> {
    await this.toggleButton().click();
    await expect(this.root()).toBeVisible();
  }

  /** Opens via the global shortcut. ControlOrMeta resolves to Cmd on macOS, Ctrl elsewhere. */
  async openViaShortcut(): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+Shift+L');
    await expect(this.root()).toBeVisible();
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.root()).toHaveCount(0);
  }

  navItem(tab: string): Locator {
    return this.page.locator(`${MODAL} [data-tab="${tab}"]`);
  }

  navCount(tab: string): Locator {
    return this.navItem(tab).locator('.pagetree-facets__nav-count');
  }

  /** The live match-count text in the modal footer (see facets-modal.js). */
  matchCount(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__match-count`);
  }

  /**
   * A checkbox-group / radio option.
   *
   * Options render as `input[name="<tab>[<field>]"][value="<value>"]` (see
   * facets-modal.js). These are real, visible checkboxes styled as Bootstrap
   * switches, so .check() works directly - no proxy handling needed.
   */
  option(tab: string, field: string, value: string): Locator {
    return this.page.locator(`${MODAL} input[name="${tab}[${field}]"][value="${value}"]`);
  }

  chips(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__chip`);
  }

  async chipLabels(): Promise<string[]> {
    const labels = await this.page
      .locator(`${MODAL} .pagetree-facets__chip .pagetree-facets__chip-label`)
      .allTextContents();

    return labels.map((label) => label.trim());
  }

  freetextField(): Locator {
    return this.page.locator(`${MODAL} [data-role="freetext"]`);
  }

  copyLinkButton(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__copy-link`);
  }

  applyButton(): Locator {
    return this.page.locator(`${MODAL} button[name="pagetree-facets-apply"]`);
  }

  async apply(): Promise<void> {
    await this.applyButton().click();
    await expect(this.root()).toHaveCount(0);
  }
}
