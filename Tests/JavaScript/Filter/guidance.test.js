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

    expect(withScope.querySelectorAll('li')).toHaveLength(5);
    expect(without.querySelectorAll('li')).toHaveLength(4);
    expect(withScope.textContent).toContain('Search from current page down');
    expect(without.textContent).not.toContain('Search from current page down');
  });

  it('says that a selection only takes effect on Apply', () => {
    // The chips look like applied filters; this is where that is spelled out.
    expect(renderHelp({ hasPageScope: false }).textContent).toContain('"Apply"');
  });

  it('covers the two things the panel used to be silent about', () => {
    // Favorites and the token view both postdate the original help text; a
    // reference panel that omits half the dialog is worse than a long one.
    const panel = renderHelp({ hasPageScope: false });

    expect(panel.textContent).toContain('Save a filter you use often');
    expect(panel.textContent).toContain('code button');
  });

  it('spells out that loading a favorite is still only a selection', () => {
    // The one behaviour a user cannot guess from the list: a click loads, it
    // does not apply.
    expect(renderHelp({ hasPageScope: false }).textContent).toContain('loads it back in here');
  });
});

describe('the help panel\'s own close button', () => {
  const open = () => {
    const panel = renderHelp({ hasPageScope: false });
    const toggle = renderHelpToggle(panel);
    toggle.click();

    return { panel, toggle, close: panel.querySelector('.pagetree-facets__help-close') };
  };

  it('closes the panel and reports it on the toggle', () => {
    const { panel, toggle, close } = open();
    expect(panel.hidden).toBe(false);

    close.click();

    // Both come from one place, so the button cannot keep looking pressed.
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('hands focus back rather than leaving it on a hidden node', () => {
    const { toggle, close } = open();
    document.body.append(toggle);

    close.click();

    expect(document.activeElement).toBe(toggle);
  });

  it('is named, being icon-only', () => {
    expect(open().close.getAttribute('aria-label')).toBe('Close');
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
