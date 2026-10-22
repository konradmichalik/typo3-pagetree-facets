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

  /** The facet's panel (see Filter/panel.js). */
  panel(tab: string): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__panel[data-panel="${tab}"]`);
  }

  panelTitle(tab: string): Locator {
    return this.panel(tab).locator('.pagetree-facets__panel-title');
  }

  panelDescription(tab: string): Locator {
    return this.panel(tab).locator('.pagetree-facets__panel-description');
  }

  /** The `<n> of <total> selected.` count a dense panel shows in its heading. */
  panelCount(tab: string): Locator {
    return this.panel(tab).locator('.pagetree-facets__panel-count');
  }

  selectNoneButton(tab: string): Locator {
    return this.panel(tab).locator('.pagetree-facets__select-none');
  }

  /** The criterion search field in the navigation (see Filter/search-results.js). */
  searchField(): Locator {
    return this.page.locator(`${MODAL} [data-role="filter-search"]`);
  }

  /** The result view that replaces the panels while the search has text. */
  searchResults(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__search-results`);
  }

  /** The live heading `<n> criteria match “<query>”`. */
  searchHeading(): Locator {
    return this.searchResults().locator('.pagetree-facets__search-heading');
  }

  /** The matches per facet shown in the navigation while searching. */
  navMatches(tab: string): Locator {
    return this.navItem(tab).locator('.pagetree-facets__nav-matches');
  }

  /** The warning under the criteria row while the count is 0 (see Filter/no-match-callout.js). */
  noMatchCallout(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__no-match`);
  }

  /** `How filtering works`, pinned under the navigation list (see Filter/guidance.js). */
  helpLink(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__help-link`);
  }

  helpPopover(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__help`);
  }

  /** The footer's status line: the live region with count and pending notice, or the shortcut tip beside it (see Filter/footer-status.js). */
  status(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__status`);
  }

  /** The settled count inside the status line. */
  countText(): Locator {
    return this.status().locator('.pagetree-facets__status-count');
  }

  /**
   * A checkbox-group / radio option.
   *
   * Options render as `input[name="<tab>[<field>]"][value="<value>"]` (see
   * facets-modal.js). These are real, visible checkboxes, so .check() works
   * directly - no proxy handling needed.
   */
  option(tab: string, field: string, value: string): Locator {
    return this.page.locator(`${MODAL} input[name="${tab}[${field}]"][value="${value}"]`);
  }

  /** The chips on the row, the hidden ones behind `+N more` included. */
  chips(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__chips .pagetree-facets__chip`);
  }

  async chipLabels(): Promise<string[]> {
    const labels = await this.chips().locator('.pagetree-facets__chip-label').allTextContents();

    return labels.map((label) => label.trim());
  }

  /** `+N more`, shown once the chips would take more than two rows (see Filter/criteria-overflow.js). */
  overflowButton(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__overflow-button`);
  }

  overflowPopover(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__overflow-panel`);
  }

  freetextField(): Locator {
    return this.page.locator(`${MODAL} [data-role="freetext"]`);
  }

  /** The phrase editor shown in text mode. */
  tokenField(): Locator {
    return this.page.locator(`${MODAL} [data-role="token-query"]`);
  }

  /** The coloured copy of the phrase under the token field (see Filter/token-highlight.js). */
  phraseMirror(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__phrase-mirror`);
  }

  phraseKeys(): Locator {
    return this.phraseMirror().locator('.pagetree-facets__phrase-key');
  }

  /** The short reference that replaces the chips in text mode. */
  reference(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__reference`);
  }

  /** The Text switch built into the search field's trailing edge. */
  textSwitch(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__text-switch`);
  }

  /** The criteria row (scope chip, chips, Clear all, actions menu). */
  criteriaRow(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__criteria`);
  }

  emptyState(): Locator {
    return this.criteriaRow().locator('.pagetree-facets__criteria-empty');
  }

  scopeChip(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__scope-chip`);
  }

  /** Opens the scope list and picks the entry whose text matches. */
  async pickScope(label: string | RegExp): Promise<void> {
    await this.scopeChip().click();
    await this.page.locator(`${MODAL} .pagetree-facets__scope-option`, { hasText: label }).click();
  }

  clearAllButton(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__clear-all`);
  }

  moreButton(): Locator {
    return this.page.locator(`${MODAL} .pagetree-facets__more`);
  }

  /** Opens the actions menu and returns the item with that text. */
  async menuItem(text: string): Promise<Locator> {
    await this.moreButton().click();

    return this.page.locator(`${MODAL} .pagetree-facets__menu-item`, { hasText: text });
  }

  applyButton(): Locator {
    return this.page.locator(`${MODAL} button[name="pagetree-facets-apply"]`);
  }

  async apply(): Promise<void> {
    await this.applyButton().click();
    await expect(this.root()).toHaveCount(0);
  }
}
