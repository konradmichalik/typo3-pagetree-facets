/**
 * Stand-in for @typo3/backend/modal.js.
 *
 * Mirrors only the shape facets-modal.js uses: `Modal.advanced(configuration)`,
 * `Modal.confirm(title, message, severity, buttons)`, `Modal.sizes` and the
 * returned element's `hideModal()`. The returned value is a plain element, since
 * that is all the modal treats it as - it queries into it, listens on it and
 * calls `hideModal()`.
 *
 * Three behaviours are reproduced because the code under test depends on them:
 * the button descriptors become real buttons in a `.t3js-modal-footer` (that is
 * how the Apply button is found again, by `name`), `hideModal()` dispatches a
 * cancelable `typo3-modal-hide` and only continues to `typo3-modal-hidden` when
 * it was not prevented, and a button carrying a `trigger` does not auto-dismiss.
 * Whether core really behaves that way is NOT something this stub can prove -
 * see the config docblock; that is what Tests/Playwright covers.
 *
 * `typo3-modal-shown` is never dispatched on its own: the modal registers that
 * listener after `advanced()` returned, so tests fire it via `show()` at the
 * point where the real dialog would have opened.
 */
const modals = [];

/** Every modal opened since the last reset, in order: `{kind, severity, element}`. */
export function openedModals() {
  return modals;
}

export function lastModal() {
  return modals[modals.length - 1] ?? null;
}

export function resetModalStub() {
  modals.length = 0;
}

function build(kind, { title = '', message = '', severity = null, content = null, buttons = [], additionalCssClasses = [] }) {
  const element = document.createElement('div');
  element.classList.add('modal', 't3js-modal', ...additionalCssClasses);

  const titleElement = document.createElement('h2');
  titleElement.className = 't3js-modal-title';
  titleElement.textContent = title;

  const body = document.createElement('div');
  body.className = 't3js-modal-body';
  if (null !== content) {
    body.append(content);
  } else {
    body.textContent = message;
  }

  const footer = document.createElement('div');
  footer.className = 't3js-modal-footer';

  element.hideModal = () => {
    const hide = new CustomEvent('typo3-modal-hide', { cancelable: true, bubbles: true });
    element.dispatchEvent(hide);
    if (hide.defaultPrevented) {
      return;
    }
    element.remove();
    element.dispatchEvent(new CustomEvent('typo3-modal-hidden', { bubbles: true }));
  };
  element.show = () => element.dispatchEvent(new CustomEvent('typo3-modal-shown', { bubbles: true }));

  for (const descriptor of buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = descriptor.text ?? '';
    button.className = ['btn', descriptor.btnClass].filter(Boolean).join(' ');
    if (descriptor.name) {
      button.name = descriptor.name;
    }
    button.addEventListener('click', (event) => {
      if (descriptor.trigger) {
        descriptor.trigger(event, element);

        return;
      }
      element.hideModal();
    });
    footer.append(button);
  }

  element.append(titleElement, body, footer);
  document.body.append(element);
  modals.push({ kind, severity, element });

  return element;
}

export default {
  sizes: { small: 'small', default: 'default', medium: 'medium', large: 'large' },
  advanced(configuration) {
    return build('advanced', configuration);
  },
  confirm(title, message, severity, buttons) {
    return build('confirm', { title, message, severity, buttons });
  },
};
