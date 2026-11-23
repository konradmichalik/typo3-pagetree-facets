import { beforeEach, describe, expect, it } from 'vitest';
import Hotkeys from '@typo3/backend/hotkeys.js';
import { FooterStatus } from '@konradmichalik/pagetree-facets/Filter/footer-status.js';

/*
 * The one status element in the modal footer: the live count, whether the
 * selection is applied, and the shortcut tip while nothing is picked.
 */

const mount = (state = {}) => {
  const status = new FooterStatus();
  document.body.replaceChildren(status.element);
  status.update({ picked: false, dirty: false, countable: false, ...state });

  return status;
};
/** What is on screen: the parts are toggled with `hidden`, never removed. */
const visibleText = (node) => [...node.childNodes]
  .filter((child) => !child.hidden)
  .map((child) => (child.nodeType === Node.TEXT_NODE ? child.textContent : visibleText(child)))
  .join('');
const text = (status) => visibleText(status.element).replace(/\s+/g, ' ').trim();
const live = (status) => status.element.querySelector('[role="status"]');
const tip = (status) => status.element.querySelector('.pagetree-facets__status-tip');
const dot = (status) => status.element.querySelector('.pagetree-facets__status-dot');
const count = (status) => status.element.querySelector('.pagetree-facets__status-count');
const suffix = (status) => status.element.querySelector('.pagetree-facets__status-text');
const skeleton = (status) => status.element.querySelector('.pagetree-facets__status-skeleton');
const visible = (node) => !node.hidden;

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
  Hotkeys.normalizedCtrlModifierKey = 'control';
});

describe('the element', () => {
  it('holds a polite live region for the count and the pending text, with the bar kept out of it', () => {
    const status = mount();

    expect(live(status).getAttribute('aria-live')).toBe('polite');
    expect(live(status).contains(dot(status))).toBe(true);
    expect(live(status).contains(count(status))).toBe(true);
    expect(live(status).contains(suffix(status))).toBe(true);
    expect(skeleton(status).getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the shortcut tip beside the live region, so its return is not announced', () => {
    const status = mount();

    expect(status.element.contains(tip(status))).toBe(true);
    expect(live(status).contains(tip(status))).toBe(false);
  });

  it('leaves the text nodes alone when the same state renders again, so nothing is announced twice', () => {
    const status = mount({ picked: true, dirty: true, countable: true });
    status.setCount(3);
    const countNode = count(status).firstChild;
    const suffixNode = suffix(status).firstChild;

    status.setCount(3);
    status.update({ picked: true, dirty: true, countable: true });

    expect(count(status).firstChild).toBe(countNode);
    expect(suffix(status).firstChild).toBe(suffixNode);
  });
});

describe('while nothing is picked', () => {
  it('shows the shortcut tip with the keys as kbd', () => {
    const status = mount();

    expect(text(status)).toBe('Tip: open this dialog from anywhere with Ctrl Shift L');
    expect([...status.element.querySelectorAll('kbd')].map((key) => key.textContent)).toEqual(['Ctrl', 'Shift', 'L']);
    expect(visible(dot(status))).toBe(false);
  });

  it('names Cmd on macOS, as core resolves the modifier', () => {
    Hotkeys.normalizedCtrlModifierKey = 'meta';

    expect(text(mount())).toBe('Tip: open this dialog from anywhere with Cmd Shift L');
  });

  it('prefers the translated tip', () => {
    globalThis.TYPO3.lang['pagetreeFacets.modal.status.tip.ctrl'] = 'Tipp: [[Strg]] [[Umschalt]] [[L]]';

    expect(text(mount())).toBe('Tipp: Strg Umschalt L');
  });

  it('says the tree is still filtered instead, once the last criterion was removed', () => {
    // Nothing is picked, but the selection differs from the applied filter, and
    // that is the state the notice exists for.
    const status = mount({ dirty: true });

    expect(text(status)).toBe('Not applied to the tree yet');
    expect(visible(dot(status))).toBe(true);
    expect(dot(status).classList.contains('is-pending')).toBe(true);
  });
});

describe('with a selection', () => {
  it('shows nothing while the selection is applied and no count is available', () => {
    const status = mount({ picked: true });

    expect(text(status)).toBe('');
    expect(visible(dot(status))).toBe(false);
  });

  it('says the selection is pending when no count is available', () => {
    const status = mount({ picked: true, dirty: true });

    expect(text(status)).toBe('Not applied to the tree yet');
    expect(dot(status).classList.contains('is-pending')).toBe(true);
  });

  it('merges the count and the pending notice into one line, the count in its own span', () => {
    const status = mount({ picked: true, dirty: true, countable: true });

    status.setCount(14);

    expect(text(status)).toBe('14 matching pages · not applied to the tree yet');
    expect(count(status).textContent).toBe('14 matching pages');
    expect(visible(dot(status))).toBe(true);
    expect(dot(status).classList.contains('is-pending')).toBe(true);
  });

  it('shows the count alone, without a dot, while the selection is applied', () => {
    const status = mount({ picked: true, countable: true });

    status.setCount(1);

    expect(text(status)).toBe('1 matching page');
    expect(visible(dot(status))).toBe(false);
  });

  it('marks a zero count, and that outranks the pending colour', () => {
    const status = mount({ picked: true, dirty: true, countable: true });

    status.setCount(0);

    expect(text(status)).toBe('No matching pages · not applied to the tree yet');
    expect(dot(status).classList.contains('is-none')).toBe(true);
    expect(dot(status).classList.contains('is-pending')).toBe(false);
  });

  it('hides the count part again when the count is withdrawn', () => {
    const status = mount({ picked: true, dirty: true, countable: true });
    status.setCount(14);

    status.setCount(null);

    expect(text(status)).toBe('Not applied to the tree yet');
    expect(visible(count(status))).toBe(false);
  });

  it('shows no count where it does not apply, whatever was last counted', () => {
    const status = mount({ picked: true, dirty: true, countable: true });
    status.setCount(14);

    status.update({ picked: true, dirty: true, countable: false });

    expect(text(status)).toBe('Not applied to the tree yet');
  });
});

describe('while counting', () => {
  it('shows the bar in place of the number and keeps the pending text, so nothing moves', () => {
    const status = mount({ picked: true, dirty: true, countable: true });
    status.setCount(14);

    status.showLoading();

    expect(visible(skeleton(status))).toBe(true);
    expect(visible(count(status))).toBe(false);
    expect(text(status)).toBe('· not applied to the tree yet');
    expect(visible(dot(status))).toBe(true);
  });

  it('shows the bar before any count has arrived', () => {
    const status = mount({ picked: true, countable: true });

    status.showLoading();

    expect(visible(skeleton(status))).toBe(true);
    expect(visible(dot(status))).toBe(false);
  });

  it('goes back to the last known count when the request fails', () => {
    const status = mount({ picked: true, countable: true });
    status.setCount(3);
    status.showLoading();

    status.hideLoading();

    expect(visible(skeleton(status))).toBe(false);
    expect(count(status).textContent).toBe('3 matching pages');
    expect(visible(count(status))).toBe(true);
  });

  it('replaces the bar with the settled count', () => {
    const status = mount({ picked: true, countable: true });
    status.showLoading();

    status.setCount(9);

    expect(visible(skeleton(status))).toBe(false);
    expect(text(status)).toBe('9 matching pages');
  });

  it('never shows a bar where the count does not apply', () => {
    const status = mount({ picked: true, countable: false });

    status.showLoading();

    expect(visible(skeleton(status))).toBe(false);
  });
});
