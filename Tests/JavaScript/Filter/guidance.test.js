import { beforeEach, describe, expect, it } from 'vitest';
import { renderHelp, renderHelpToggle, renderHint } from '@konradmichalik/pagetree-facets/Filter/guidance.js';

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
});

describe('renderHint', () => {
  it('always produces a tip, even with no language files loaded', () => {
    const hint = renderHint();

    expect(hint.querySelector('span').textContent.length).toBeGreaterThan(0);
  });

  it('formats the tip markup rather than showing its markers', () => {
    // Over enough draws every tip appears; all of them carry either `code` or
    // [[key]] markers, so none may leak through as literal text.
    const rendered = Array.from({ length: 60 }, () => renderHint());

    expect(rendered.every((hint) => !hint.textContent.includes('`'))).toBe(true);
    expect(rendered.every((hint) => !hint.textContent.includes('[['))).toBe(true);
    expect(rendered.some((hint) => hint.querySelector('code') || hint.querySelector('kbd'))).toBe(true);
  });

  it('varies between calls, so the tip is not always the same one', () => {
    const seen = new Set(Array.from({ length: 60 }, () => renderHint().textContent));

    expect(seen.size).toBeGreaterThan(1);
  });

  it('hides its icon from assistive technology', () => {
    expect(renderHint().querySelector('typo3-backend-icon').getAttribute('aria-hidden')).toBe('true');
  });

  it('prefers a translated string over the fallback', () => {
    globalThis.TYPO3.lang = Object.fromEntries(
      ['tokens', 'combine', 'favorites', 'copyLink', 'liveSearch', 'scope']
        .map((key) => [`pagetreeFacets.modal.hint.${key}`, 'Translated tip']),
    );

    expect(renderHint().textContent).toBe('Translated tip');
  });
});

describe('renderHelp', () => {
  it('starts collapsed and carries an id to be referenced by', () => {
    const panel = renderHelp({ hasPageScope: false });

    expect(panel.hidden).toBe(true);
    expect(panel.id).toBeTruthy();
  });

  it('explains the page scope only while that control exists', () => {
    const withScope = renderHelp({ hasPageScope: true });
    const without = renderHelp({ hasPageScope: false });

    expect(withScope.querySelectorAll('li')).toHaveLength(4);
    expect(without.querySelectorAll('li')).toHaveLength(3);
    expect(withScope.textContent).toContain('Search from current page down');
    expect(without.textContent).not.toContain('Search from current page down');
  });

  it('says that a selection only takes effect on Apply', () => {
    // The chips look like applied filters; this is where that is spelled out.
    expect(renderHelp({ hasPageScope: false }).textContent).toContain('"Apply"');
  });
});

describe('renderHelpToggle', () => {
  it('points at the panel it controls', () => {
    const panel = renderHelp({ hasPageScope: false });
    const toggle = renderHelpToggle(panel);

    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('is named, being icon-only', () => {
    const toggle = renderHelpToggle(renderHelp({ hasPageScope: false }));

    expect(toggle.getAttribute('aria-label')).toBe('Filter syntax');
    expect(toggle.textContent.trim()).toBe('');
  });

  it('expands and collapses, keeping aria-expanded truthful', () => {
    const panel = renderHelp({ hasPageScope: false });
    const toggle = renderHelpToggle(panel);

    toggle.click();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
