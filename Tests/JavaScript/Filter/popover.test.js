import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPopover } from '@konradmichalik/pagetree-facets/Filter/popover.js';

/*
 * The open/close plumbing the scope list and the actions menu share. What the
 * panel does while open (arrow keys, selection) is each caller's business.
 */

const mount = (onOpen = vi.fn()) => {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  const panel = document.createElement('div');
  panel.hidden = true;
  const inside = document.createElement('button');
  inside.type = 'button';
  panel.append(inside);
  const outside = document.createElement('button');
  outside.type = 'button';
  document.body.replaceChildren(trigger, panel, outside);
  const popover = attachPopover({ trigger, panel, onOpen });

  return { trigger, panel, inside, outside, popover, onOpen };
};

beforeEach(() => {
  document.body.replaceChildren();
});

describe('attachPopover', () => {
  it('starts closed and says so on the trigger', () => {
    const { trigger, panel, popover } = mount();

    expect(panel.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(popover.isOpen()).toBe(false);
  });

  it('toggles on the trigger and reports each opening', () => {
    const { trigger, panel, popover, onOpen } = mount();

    trigger.click();
    expect(panel.hidden).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(popover.isOpen()).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);

    trigger.click();
    expect(panel.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and hands focus back to the trigger, keeping the key from the modal', () => {
    const { trigger, panel, inside } = mount();
    trigger.click();
    inside.focus();
    const reachedModal = vi.fn();
    document.body.addEventListener('keydown', reachedModal);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    inside.dispatchEvent(event);

    expect(panel.hidden).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(reachedModal).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a pointer press outside, leaving focus where the press went', () => {
    const { trigger, panel, outside } = mount();
    trigger.click();

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(panel.hidden).toBe(true);
    expect(document.activeElement).not.toBe(trigger);
  });

  it('stays open on a pointer press inside the panel or on the trigger', () => {
    const { trigger, panel, inside } = mount();
    trigger.click();

    inside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(panel.hidden).toBe(false);
  });

  it('closes once focus leaves the panel for somewhere else', () => {
    const { panel, inside, outside, trigger } = mount();
    trigger.click();
    inside.focus();

    inside.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));

    expect(panel.hidden).toBe(true);
  });

  it('does not treat focus moving within the panel, or to nowhere, as leaving', () => {
    const { panel, inside, trigger } = mount();
    trigger.click();

    inside.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: inside }));
    inside.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));

    expect(panel.hidden).toBe(false);
  });

  it('drops its document listener when closed, so a later press outside is nobody\'s business', () => {
    const { trigger, panel, popover, outside } = mount();
    trigger.click();
    popover.close();
    panel.hidden = false; // reopened by hand, without the popover knowing

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(panel.hidden).toBe(false);
  });

  it('is a no-op to close while already closed', () => {
    const { popover, trigger } = mount();

    expect(() => popover.close()).not.toThrow();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
