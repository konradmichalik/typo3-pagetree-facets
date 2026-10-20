import { beforeEach, describe, expect, it } from 'vitest';
import Hotkeys from '@typo3/backend/hotkeys.js';
import { buildHelp } from '@konradmichalik/pagetree-facets/Filter/guidance.js';

/*
 * The help popover: opened from the link pinned under the navigation, placed
 * next to it over the content. Every example token it prints exists in the code
 * (see Classes/Tab and Classes/Option), which the token test pins down.
 */

const mount = () => {
  const root = document.createElement('div');
  const nav = document.createElement('div');
  nav.className = 'pagetree-facets__nav';
  const outside = document.createElement('button');
  outside.type = 'button';
  const help = buildHelp({ getLayout: () => ({ root, nav }) });
  nav.append(help.link);
  root.append(nav, help.panel, outside);
  document.body.replaceChildren(root);

  return { ...help, outside };
};

const titles = (panel) => [...panel.querySelectorAll('h3')].map((heading) => heading.textContent);

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
  Hotkeys.normalizedCtrlModifierKey = 'control';
});

describe('the link', () => {
  it('is a text button with the help icon that controls the popover', () => {
    const { link, panel } = mount();

    expect(link.tagName).toBe('BUTTON');
    expect(link.type).toBe('button');
    expect(link.textContent.trim()).toBe('How filtering works');
    expect(link.querySelector('typo3-backend-icon').getAttribute('identifier')).toBe('actions-question-circle');
    expect(link.getAttribute('aria-controls')).toBe(panel.id);
    expect(link.getAttribute('aria-expanded')).toBe('false');
    expect(link.title).toBe('Explains how criteria combine and what each action does.');
  });
});

describe('the popover', () => {
  it('starts closed as a named dialog', () => {
    const { panel } = mount();

    expect(panel.hidden).toBe(true);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(document.getElementById(panel.getAttribute('aria-labelledby')).textContent).toBe('How filtering works');
  });

  it('opens from the link, takes focus and sits next to the navigation', () => {
    const { link, panel } = mount();

    link.click();

    expect(panel.hidden).toBe(false);
    expect(link.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(panel);
    // Positioned on open, from the navigation's edge within the modal content.
    expect(panel.style.insetInlineStart).not.toBe('');
    expect(panel.style.bottom).not.toBe('');
  });

  it('closes on Escape and hands focus back to the link', () => {
    const { link, panel } = mount();
    link.click();

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(link);
  });

  it('closes from its own button, named for screen readers, and hands focus back', () => {
    const { link, panel } = mount();
    link.click();
    const close = panel.querySelector('.pagetree-facets__help-close');
    expect(close.getAttribute('aria-label')).toBe('Close');

    close.click();

    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(link);
  });

  it('closes on a press outside', () => {
    const { link, panel, outside } = mount();
    link.click();

    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(panel.hidden).toBe(true);
  });

  it('can be closed by the modal on teardown', () => {
    const { link, panel, close } = mount();
    link.click();

    close();

    expect(panel.hidden).toBe(true);
  });
});

describe('the content', () => {
  it('covers combining, applying, sharing, typing and the global search, in that order', () => {
    const { panel } = mount();

    expect(titles(panel)).toEqual(['Combining criteria', 'Nothing changes until you apply', 'Keep and share', 'Prefer typing?']);
    expect(panel.textContent).toContain('Within one category, any choice is enough. Across categories, a page must match all of them.');
    expect(panel.textContent).toContain('The page tree only updates once you choose Apply.');
    expect(panel.textContent).toContain('saves a filter as a favorite or copies a link to it');
    expect(panel.textContent).toContain('Looking for one record itself?');
  });

  it('illustrates or within a category and and across categories with chips', () => {
    const { panel } = mount();
    const illustration = panel.querySelector('.pagetree-facets__help-chips');

    expect([...illustration.querySelectorAll('.pagetree-facets__help-chip')].map((chip) => chip.textContent))
      .toEqual(['Standard Page', 'Link', 'Hidden']);
    expect(illustration.textContent.replace(/\s+/g, ' ').trim()).toBe('Standard Page or Link and Hidden');
  });

  it('prints five example tokens that all exist in the code, each with what it does', () => {
    const { panel } = mount();
    const tokens = [...panel.querySelectorAll('.pagetree-facets__help-tokens code')].map((code) => code.textContent);

    // doktype: DoktypeTab, comma split by TokenParser; is:empty: Option/State;
    // ce:uploads: core tt_content CType; updated:<30d: ActivityTab::PRESETS;
    // by:me: ActivityTab resolves "me" to the current user.
    expect(tokens).toEqual(['doktype:1,3', 'is:empty', 'ce:uploads', 'updated:<30d', 'by:me']);
    expect([...panel.querySelectorAll('.pagetree-facets__help-tokens dd')].map((dd) => dd.textContent))
      .toEqual(['page type, comma means or', 'page state', 'contains this element type', 'changed in the last 30 days', 'last edited by you']);
  });

  it('names the global search shortcut with the platform key as kbd', () => {
    const keys = (panel) => [...panel.querySelectorAll('.pagetree-facets__help-global kbd')].map((kbd) => kbd.textContent);
    expect(keys(mount().panel)).toEqual(['Ctrl', 'K']);

    Hotkeys.normalizedCtrlModifierKey = 'meta';
    expect(keys(mount().panel)).toEqual(['Cmd', 'K']);
  });
});
