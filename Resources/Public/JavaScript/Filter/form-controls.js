/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */

/**
 * Small form primitives shared by the modal and by the widgets it composes.
 *
 * They live here rather than on the modal because more than one module needs
 * them: passing them down as injected callbacks made every consumer's signature
 * carry a dependency it only ever forwarded unchanged.
 */

let idCounter = 0;

/**
 * A DOM id that no other element carries. Needed wherever aria-describedby or
 * aria-controls has to point somewhere, and the same control can be rendered more
 * than once per document.
 *
 * @param {string} prefix
 * @returns {string}
 */
export function uniqueId(prefix) {
  return `${prefix}-${idCounter++}`;
}

/**
 * A backend icon that adds nothing to the accessible name.
 *
 * Every icon this extension renders is decorative: it either sits beside its own
 * text, or inside a button that carries an aria-label. Hiding them from assistive
 * technology is therefore always right - having it in one place is what keeps that
 * true, rather than remembering the attribute at thirteen call sites.
 *
 * @param {string} identifier - a registered icon identifier
 * @param {string} [size]
 * @returns {HTMLElement}
 */
export function decorativeIcon(identifier, size = 'small') {
  const icon = document.createElement('typo3-backend-icon');
  icon.setAttribute('identifier', identifier);
  icon.setAttribute('size', size);
  icon.setAttribute('aria-hidden', 'true');

  return icon;
}

/**
 * Wraps an input with a × that empties it.
 *
 * @param {HTMLInputElement} input
 * @returns {HTMLElement} the wrapper - append this, not the bare input
 */
export function clearable(input) {
  const wrap = document.createElement('div');
  wrap.className = 'pagetree-facets__clearable';

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'pagetree-facets__clear';
  clear.textContent = '×';
  const label = TYPO3.lang?.['pagetreeFacets.modal.clear'] ?? 'Clear';
  clear.title = label;
  clear.setAttribute('aria-label', label);
  clear.hidden = '' === input.value;

  clear.addEventListener('click', () => {
    input.value = '';
    // Picker controls keep the wire value out of band, so clearing the visible
    // text alone would leave the criterion active.
    delete input.dataset.value;
    delete input.dataset.label;
    clear.hidden = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  });
  input.addEventListener('input', () => { clear.hidden = '' === input.value; });

  wrap.append(input, clear);

  return wrap;
}

/**
 * A screen-reader-only help text bound to a control via aria-describedby.
 *
 * Returned rather than appended, so the caller decides where it sits. It stays out
 * of the visible label on purpose: the active-filter chips are derived from label
 * text, and a description leaking in there would end up in the chip.
 *
 * @param {HTMLElement} input - gets the aria-describedby pointer
 * @param {string} description
 * @returns {HTMLElement}
 */
export function optionHelp(input, description) {
  const descriptionId = uniqueId('pagetree-facets__option-help');
  input.setAttribute('aria-describedby', descriptionId);

  const hidden = document.createElement('span');
  hidden.id = descriptionId;
  hidden.className = 'visually-hidden';
  hidden.textContent = description;

  return hidden;
}

/**
 * Appends `text` to `container`, turning `\`code\`` into <code> and `[[key]]` into
 * <kbd>. Deliberately not innerHTML: these strings come from translation files,
 * which are content, so they get parsed rather than trusted as markup.
 *
 * @param {HTMLElement} container
 * @param {string} text
 */
export function appendRichText(container, text) {
  const pattern = /`([^`]+)`|\[\[([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const [, code, key] = match;
    const element = document.createElement(code !== undefined ? 'code' : 'kbd');
    element.textContent = code ?? key;
    container.append(element);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    container.append(document.createTextNode(text.slice(lastIndex)));
  }
}
