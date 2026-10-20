import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSearchField, renderChip } from '@konradmichalik/pagetree-facets/Filter/criteria-row.js';

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

  it('reports the removal', () => {
    const onRemove = vi.fn();

    renderChip(criterion, onRemove).querySelector('.pagetree-facets__chip-remove').click();

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
