/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */

/**
 * Open and close plumbing for a panel that a button pops open: the scope list
 * and the actions menu. The trigger reports the state through aria-expanded,
 * Escape and a pointer press outside close the panel, and focus returns to the
 * trigger unless the press itself moved it elsewhere.
 *
 * What the panel does while open (arrow keys, selection) is the caller's part.
 *
 * @param {{trigger: HTMLElement, panel: HTMLElement, onOpen?: () => void}} parts
 * @returns {{show: () => void, close: (returnFocus?: boolean) => void, isOpen: () => boolean}}
 */
export function attachPopover({ trigger, panel, onOpen }) {
  let open = false;

  const onPointerDown = (event) => {
    if (!panel.contains(event.target) && !trigger.contains(event.target)) {
      close(false);
    }
  };
  const onKeydown = (event) => {
    if ('Escape' === event.key) {
      // Also keeps the key from the modal, which would close itself on it.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };
  const onFocusOut = (event) => {
    const next = event.relatedTarget;
    if (next && !panel.contains(next) && !trigger.contains(next)) {
      close(false);
    }
  };

  function show() {
    if (open) {
      return;
    }
    open = true;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    // Capture: the press may land on an element that stops propagation.
    document.addEventListener('pointerdown', onPointerDown, true);
    panel.addEventListener('keydown', onKeydown);
    panel.addEventListener('focusout', onFocusOut);
    onOpen?.();
  }

  function close(returnFocus = false) {
    if (!open) {
      return;
    }
    open = false;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onPointerDown, true);
    panel.removeEventListener('keydown', onKeydown);
    panel.removeEventListener('focusout', onFocusOut);
    if (returnFocus) {
      trigger.focus();
    }
  }

  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => (open ? close(true) : show()));

  return { show, close, isOpen: () => open };
}
