import { beforeEach, describe, expect, it } from 'vitest';
import { NoMatchCallout } from '@konradmichalik/pagetree-facets/Filter/no-match-callout.js';

/*
 * The warning under the criteria row while the live count is 0 (see
 * Filter/no-match-callout.js). What it shows is decided here; when the count
 * is 0 is the footer status's call, which the modal relays.
 */

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
});

const title = (callout) => callout.element.querySelector('.pagetree-facets__no-match-title').textContent;

describe('the callout', () => {
  it('starts hidden and is a core warning alert with the triangle icon', () => {
    const callout = new NoMatchCallout();

    expect(callout.element.hidden).toBe(true);
    expect(callout.element.className).toContain('alert');
    expect(callout.element.className).toContain('alert-warning');
    expect(callout.element.querySelector('typo3-backend-icon').getAttribute('identifier')).toBe('actions-exclamation-triangle');
  });

  it('is not a live region: the footer status already announces No matching pages', () => {
    const callout = new NoMatchCallout();

    expect(callout.element.hasAttribute('aria-live')).toBe(false);
    expect(callout.element.hasAttribute('role')).toBe(false);
    expect(callout.element.querySelector('[aria-live], [role="alert"], [role="status"]')).toBeNull();
  });

  it('names the number of criteria and says how to widen the selection, without a button', () => {
    const callout = new NoMatchCallout();

    callout.update({ none: true, criteria: 3 });

    expect(callout.element.hidden).toBe(false);
    expect(title(callout)).toBe('No page matches all 3 criteria');
    expect(callout.element.querySelector('.pagetree-facets__no-match-text').textContent)
      .toBe('Every criterion has to match at once. Remove one with its × above, or widen it in its category. The count below updates right away.');
    expect(callout.element.querySelector('button')).toBeNull();
  });

  it('reads differently for a single criterion', () => {
    const callout = new NoMatchCallout();

    callout.update({ none: true, criteria: 1 });

    expect(title(callout)).toBe('No page matches this criterion');
  });

  it('hides again as soon as the count is not 0 any more', () => {
    const callout = new NoMatchCallout();
    callout.update({ none: true, criteria: 2 });

    callout.update({ none: false, criteria: 2 });

    expect(callout.element.hidden).toBe(true);
  });

  it('stays hidden without a chip to remove, such as a scope alone matching nothing', () => {
    const callout = new NoMatchCallout();

    callout.update({ none: true, criteria: 0 });

    expect(callout.element.hidden).toBe(true);
  });
});
