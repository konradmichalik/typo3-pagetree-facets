import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendRichText, clearable, optionHelp, uniqueId } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';

const textInput = (value = '') => {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;

  return input;
};

beforeEach(() => {
  globalThis.TYPO3 = { lang: {} };
});

describe('clearable', () => {
  it('hides its button while the field is empty', () => {
    const wrap = clearable(textInput());

    expect(wrap.querySelector('button').hidden).toBe(true);
  });

  it('shows the button for a prefilled field', () => {
    const wrap = clearable(textInput('doktype:1'));

    expect(wrap.querySelector('button').hidden).toBe(false);
  });

  it('follows typing', () => {
    const input = textInput();
    const wrap = clearable(input);
    const button = wrap.querySelector('button');

    input.value = 'x';
    input.dispatchEvent(new Event('input'));
    expect(button.hidden).toBe(false);

    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(button.hidden).toBe(true);
  });

  it('also drops the out-of-band picker value, not just the visible text', () => {
    // Picker controls keep the wire value in dataset.value - clearing the text
    // alone would leave the criterion active while looking empty.
    const input = textInput('Me (admin)');
    input.dataset.value = 'me';
    input.dataset.label = 'Me (admin)';
    const wrap = clearable(input);

    wrap.querySelector('button').click();

    expect(input.value).toBe('');
    expect(input.dataset.value).toBeUndefined();
    expect(input.dataset.label).toBeUndefined();
  });

  it('emits both input and change, which is what the modal listens for', () => {
    const input = textInput('x');
    const wrap = clearable(input);
    const seen = [];
    input.addEventListener('input', () => seen.push('input'));
    input.addEventListener('change', () => seen.push('change'));

    wrap.querySelector('button').click();

    expect(seen).toEqual(['input', 'change']);
  });

  it('is labelled, not just an × glyph', () => {
    const button = clearable(textInput()).querySelector('button');

    // The pattern for every icon-only control here: the short name is what gets
    // announced, the title is the explanation a hover asks for.
    expect(button.getAttribute('aria-label')).toBe('Clear');
    expect(button.title).toBe('Empties this field.');
  });
});

describe('optionHelp', () => {
  it('binds a hidden description to the control', () => {
    const input = textInput();
    const help = optionHelp(input, 'Only pages without content');

    expect(help.className).toBe('visually-hidden');
    expect(help.textContent).toBe('Only pages without content');
    expect(input.getAttribute('aria-describedby')).toBe(help.id);
  });

  it('gives each control its own id', () => {
    const first = textInput();
    const second = textInput();
    optionHelp(first, 'a');
    optionHelp(second, 'b');

    expect(first.getAttribute('aria-describedby')).not.toBe(second.getAttribute('aria-describedby'));
  });
});

describe('uniqueId', () => {
  it('never repeats, and keeps the prefix', () => {
    const ids = [uniqueId('p'), uniqueId('p'), uniqueId('p')];

    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id.startsWith('p-'))).toBe(true);
  });
});

describe('appendRichText', () => {
  const render = (text) => {
    const container = document.createElement('p');
    appendRichText(container, text);

    return container;
  };

  it('turns backticks into code and double brackets into kbd', () => {
    const el = render('Try `doktype:1` or press [[Ctrl]]+[[K]].');

    expect([...el.querySelectorAll('code')].map((n) => n.textContent)).toEqual(['doktype:1']);
    expect([...el.querySelectorAll('kbd')].map((n) => n.textContent)).toEqual(['Ctrl', 'K']);
    expect(el.textContent).toBe('Try doktype:1 or press Ctrl+K.');
  });

  it('keeps plain text untouched', () => {
    const el = render('Nothing special here');

    expect(el.childNodes).toHaveLength(1);
    expect(el.textContent).toBe('Nothing special here');
  });

  it('does not treat the source as markup', () => {
    // These strings come from translation files, so they are content. Parsing them
    // rather than assigning innerHTML is what keeps that true.
    const el = render('<b>bold</b> and `<i>code</i>`');

    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('i')).toBeNull();
    expect(el.querySelector('code').textContent).toBe('<i>code</i>');
    expect(el.textContent).toBe('<b>bold</b> and <i>code</i>');
  });

  it('handles a marker at either end', () => {
    expect(render('`lead` then').textContent).toBe('lead then');
    expect(render('then `trail`').textContent).toBe('then trail');
  });
});
