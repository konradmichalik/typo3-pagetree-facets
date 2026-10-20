import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCriteriaRow, buildSearchField, renderChip } from '@konradmichalik/pagetree-facets/Filter/criteria-row.js';

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
  document.body.replaceChildren();
});

describe('buildSearchField', () => {
  it('holds the page-title field with the Text switch at its trailing edge', () => {
    const { element, freetext, tokenField, textSwitch } = buildSearchField({ freetext: 'home', onToggle: vi.fn() });

    expect(freetext.dataset.role).toBe('freetext');
    expect(freetext.value).toBe('home');
    expect(freetext.placeholder).toBe('Page title or UID');
    expect(freetext.getAttribute('aria-label')).toBe('Page title or UID');
    expect(tokenField.dataset.role).toBe('token-query');
    expect(tokenField.hidden).toBe(true);
    // The switch is the last child, so it sits against the field's trailing edge.
    expect(element.lastElementChild).toBe(textSwitch);
  });

  it('labels the switch with the code icon and the word Text, never the icon alone', () => {
    const { textSwitch } = buildSearchField({ freetext: '', onToggle: vi.fn() });

    expect(textSwitch.type).toBe('button');
    expect(textSwitch.textContent.trim()).toBe('Text');
    expect(textSwitch.querySelector('typo3-backend-icon').getAttribute('identifier')).toBe('actions-code');
    expect(textSwitch.getAttribute('aria-pressed')).toBe('false');
    expect(textSwitch.title).toBe('Shows the whole filter as editable text.');
  });

  it('reports a click on the switch', () => {
    const onToggle = vi.fn();
    const { textSwitch } = buildSearchField({ freetext: '', onToggle });

    textSwitch.click();

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('swaps the two fields and presses the switch in text mode', () => {
    const { element, freetext, tokenField, textSwitch, setTextMode } = buildSearchField({ freetext: '', onToggle: vi.fn() });

    setTextMode(true);
    expect(freetext.closest('.pagetree-facets__freetext').hidden).toBe(true);
    expect(tokenField.hidden).toBe(false);
    expect(textSwitch.getAttribute('aria-pressed')).toBe('true');
    expect(element.classList.contains('is-text')).toBe(true);

    setTextMode(false);
    expect(freetext.closest('.pagetree-facets__freetext').hidden).toBe(false);
    expect(tokenField.hidden).toBe(true);
    expect(textSwitch.getAttribute('aria-pressed')).toBe('false');
    expect(element.classList.contains('is-text')).toBe(false);
  });

  it('sets the page title programmatically and keeps its clear button in step', () => {
    const { element, freetext, setFreetext } = buildSearchField({ freetext: '', onToggle: vi.fn() });
    const clear = element.querySelector('.pagetree-facets__clear');
    expect(clear.hidden).toBe(true);

    setFreetext('contact');
    expect(freetext.value).toBe('contact');
    expect(clear.hidden).toBe(false);

    setFreetext('');
    expect(freetext.value).toBe('');
    expect(clear.hidden).toBe(true);
  });

  it('keeps the token field out of autocorrection, being query syntax', () => {
    const { tokenField } = buildSearchField({ freetext: '', onToggle: vi.fn() });

    expect(tokenField.spellcheck).toBe(false);
    expect(tokenField.autocomplete).toBe('off');
    expect(tokenField.getAttribute('aria-label')).toBe('Filter tokens');
  });
});

describe('renderChip', () => {
  const criterion = { prefix: 'Page type', value: 'Standard Page', label: 'Page type: Standard Page' };

  it('shows the facet prefix and the value as one phrase', () => {
    const chip = renderChip(criterion, vi.fn());

    expect(chip.querySelector('.pagetree-facets__chip-prefix').textContent).toBe('Page type:');
    expect(chip.querySelector('.pagetree-facets__chip-value').textContent).toBe('Standard Page');
    expect(chip.querySelector('.pagetree-facets__chip-label').textContent).toBe('Page type: Standard Page');
  });

  it('keeps the full text on the chip for when the value is shortened', () => {
    expect(renderChip(criterion, vi.fn()).title).toBe('Page type: Standard Page');
  });

  it('names the × after the criterion it removes', () => {
    const remove = renderChip(criterion, vi.fn()).querySelector('.pagetree-facets__chip-remove');

    expect(remove.getAttribute('aria-label')).toBe('Remove Page type: Standard Page');
    expect(remove.title).toBe('Remove Page type: Standard Page');
    expect(remove.type).toBe('button');
  });

  it('keeps a value with replacement patterns in the name as typed', () => {
    const odd = { prefix: 'Title', value: "Q&A $& $'", label: "Title: Q&A $& $'" };

    const remove = renderChip(odd, vi.fn()).querySelector('.pagetree-facets__chip-remove');

    expect(remove.getAttribute('aria-label')).toBe("Remove Title: Q&A $& $'");
  });

  it('reports the removal', () => {
    const onRemove = vi.fn();

    renderChip(criterion, onRemove).querySelector('.pagetree-facets__chip-remove').click();

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('buildCriteriaRow', () => {
  const mount = (options = {}) => {
    const handlers = { onClearAll: vi.fn(), onSaveFavorite: vi.fn(), onCopyLink: vi.fn(), focusFallback: vi.fn() };
    const scope = document.createElement('div');
    scope.className = 'pagetree-facets__scope';
    const row = buildCriteriaRow({ scope, ...handlers, ...options });
    document.body.replaceChildren(row.element);

    return { row, scope, ...handlers };
  };
  const chip = (label) => renderChip({ prefix: 'Page type', value: label, label: `Page type: ${label}` }, vi.fn());
  const criteria = (row) => row.element.querySelector('.pagetree-facets__criteria');
  const more = (row) => row.element.querySelector('.pagetree-facets__more');
  const menu = (row) => row.element.querySelector('[role="menu"]');
  const items = (row) => [...menu(row).querySelectorAll('[role="menuitem"]')];
  const clearAll = (row) => row.element.querySelector('.pagetree-facets__clear-all');
  const key = (target, name) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);

    return event;
  };

  it('starts empty: dashed row with the fixed text, no Clear all, no menu', () => {
    const { row, scope } = mount();

    expect(criteria(row).classList.contains('is-empty')).toBe(true);
    expect(row.element.querySelector('.pagetree-facets__criteria-empty').textContent)
      .toBe('Nothing picked yet. Choose a category on the left or type a page title above.');
    expect(row.element.querySelector('.pagetree-facets__criteria-empty').hidden).toBe(false);
    expect(row.element.querySelector('.pagetree-facets__criteria-actions').hidden).toBe(true);
    // The scope stays in that state, ahead of everything else.
    expect(criteria(row).firstElementChild).toBe(scope);
  });

  it('renders without a scope element', () => {
    const row = buildCriteriaRow({
      scope: null, onClearAll: vi.fn(), onSaveFavorite: vi.fn(), onCopyLink: vi.fn(), focusFallback: vi.fn(),
    });

    expect(row.element.querySelector('.pagetree-facets__chips')).not.toBeNull();
  });

  describe('focus across a rebuild', () => {
    const removeButtons = (row) => [...row.element.querySelectorAll('.pagetree-facets__chip-remove')];

    it('lands on the chip that took the removed one\'s place', () => {
      const { row, focusFallback } = mount();
      row.update({ chips: [chip('Standard'), chip('Link'), chip('Shortcut')], savable: true });
      removeButtons(row)[1].focus();

      row.update({ chips: [chip('Standard'), chip('Shortcut')], savable: true });

      expect(document.activeElement).toBe(removeButtons(row)[1]);
      expect(document.activeElement.getAttribute('aria-label')).toBe('Remove Page type: Shortcut');
      expect(focusFallback).not.toHaveBeenCalled();
    });

    it('falls back to the previous chip when the last one was removed', () => {
      const { row } = mount();
      row.update({ chips: [chip('Standard'), chip('Link')], savable: true });
      removeButtons(row)[1].focus();

      row.update({ chips: [chip('Standard')], savable: true });

      expect(document.activeElement).toBe(removeButtons(row)[0]);
    });

    it('hands focus on once no chip is left', () => {
      const { row, focusFallback } = mount();
      row.update({ chips: [chip('Standard')], savable: true });
      removeButtons(row)[0].focus();

      row.update({ chips: [], savable: false });

      expect(focusFallback).toHaveBeenCalledTimes(1);
    });

    it('hands focus on when Clear all hides itself under the focus', () => {
      const { row, focusFallback } = mount();
      row.update({ chips: [chip('Standard')], savable: true });
      clearAll(row).focus();

      row.update({ chips: [], savable: false });

      expect(focusFallback).toHaveBeenCalledTimes(1);
    });

    it('leaves focus alone while it is elsewhere', () => {
      const { row, focusFallback } = mount();
      row.update({ chips: [chip('Standard')], savable: true });
      const field = document.createElement('input');
      document.body.append(field);
      field.focus();

      row.update({ chips: [chip('Link')], savable: true });

      expect(document.activeElement).toBe(field);
      expect(focusFallback).not.toHaveBeenCalled();
    });
  });

  it('lists the chips in place of the empty text and reveals the actions once something is savable', () => {
    const { row } = mount();

    row.update({ chips: [chip('Standard'), chip('Link')], savable: true });

    expect(criteria(row).classList.contains('is-empty')).toBe(false);
    expect(row.element.querySelector('.pagetree-facets__criteria-empty').hidden).toBe(true);
    expect([...row.element.querySelectorAll('.pagetree-facets__chip-value')].map((value) => value.textContent))
      .toEqual(['Standard', 'Link']);
    expect(row.element.querySelector('.pagetree-facets__criteria-actions').hidden).toBe(false);
  });

  it('keeps the actions for a savable selection without chips, such as a scope alone', () => {
    const { row } = mount();

    row.update({ chips: [], savable: true });

    expect(criteria(row).classList.contains('is-empty')).toBe(true);
    expect(row.element.querySelector('.pagetree-facets__criteria-actions').hidden).toBe(false);
  });

  it('offers Clear all as a text button', () => {
    const { row, onClearAll } = mount();
    row.update({ chips: [chip('Standard')], savable: true });

    expect(clearAll(row).textContent).toBe('Clear all');
    expect(clearAll(row).type).toBe('button');
    clearAll(row).click();

    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('names the icon-only button and the menu after it', () => {
    const { row } = mount();

    expect(more(row).getAttribute('aria-label')).toBe('More actions');
    expect(more(row).getAttribute('aria-haspopup')).toBe('menu');
    expect(more(row).getAttribute('aria-expanded')).toBe('false');
    expect(more(row).getAttribute('aria-controls')).toBe(menu(row).id);
    expect(more(row).id).toMatch(/^pagetree-facets__more-\d+$/);
    expect(menu(row).getAttribute('aria-labelledby')).toBe(more(row).id);
    expect(more(row).querySelector('typo3-backend-icon').getAttribute('identifier')).toBe('actions-menu-alternative');
    expect(items(row).map((item) => item.textContent.trim())).toEqual(['Save as favorite', 'Copy link to this filter']);
    expect(items(row).map((item) => item.querySelector('typo3-backend-icon').getAttribute('identifier')))
      .toEqual(['actions-star', 'actions-clipboard']);
  });

  it('opens the menu with its first item focused, and the arrows walk the items', () => {
    const { row } = mount();
    row.update({ chips: [chip('Standard')], savable: true });

    more(row).click();

    expect(menu(row).hidden).toBe(false);
    expect(document.activeElement).toBe(items(row)[0]);
    expect(key(items(row)[0], 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items(row)[1]);
    key(items(row)[1], 'ArrowDown');
    expect(document.activeElement).toBe(items(row)[0]);
    key(items(row)[0], 'ArrowUp');
    expect(document.activeElement).toBe(items(row)[1]);
    key(items(row)[1], 'Home');
    expect(document.activeElement).toBe(items(row)[0]);
    key(items(row)[0], 'End');
    expect(document.activeElement).toBe(items(row)[1]);
    expect(key(items(row)[1], 'Tab').defaultPrevented).toBe(false);
  });

  it('closes on Escape, handing focus back to the button', () => {
    const { row } = mount();
    more(row).click();

    key(items(row)[0], 'Escape');

    expect(menu(row).hidden).toBe(true);
    expect(document.activeElement).toBe(more(row));
  });

  it('copies the link from the menu and closes it', () => {
    const { row, onCopyLink } = mount();
    more(row).click();

    items(row)[1].click();

    expect(onCopyLink).toHaveBeenCalledTimes(1);
    expect(menu(row).hidden).toBe(true);
    expect(document.activeElement).toBe(more(row));
  });

  it('opens the name form under the row from the menu and saves through it', () => {
    const { row, onSaveFavorite } = mount();
    more(row).click();

    items(row)[0].click();

    const form = row.element.querySelector('.pagetree-facets__favorite-form');
    expect(menu(row).hidden).toBe(true);
    expect(form.hidden).toBe(false);
    expect(criteria(row).nextElementSibling).toBe(form);
    expect(document.activeElement).toBe(form.querySelector('input'));

    form.querySelector('input').value = 'Hidden pages';
    form.querySelector('.btn-primary').click();

    expect(onSaveFavorite).toHaveBeenCalledWith('Hidden pages');
    expect(form.hidden).toBe(true);
    expect(document.activeElement).toBe(more(row));
  });

  it('closes the menu and the name form once nothing is savable any more', () => {
    const { row } = mount();
    row.update({ chips: [chip('Standard')], savable: true });
    more(row).click();
    items(row)[0].click();

    row.update({ chips: [], savable: false });

    expect(row.element.querySelector('.pagetree-facets__favorite-form').hidden).toBe(true);
    expect(menu(row).hidden).toBe(true);
  });

  it('can be closed by the modal on teardown', () => {
    const { row } = mount();
    more(row).click();

    row.close();

    expect(menu(row).hidden).toBe(true);
  });
});
