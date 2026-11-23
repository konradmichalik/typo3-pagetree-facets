import { beforeEach, describe, expect, it } from 'vitest';
import { buildPhraseField, renderPhrase } from '@konradmichalik/pagetree-facets/Filter/token-highlight.js';

/*
 * The phrase editor: the typed text stays in a plain input, a mirror layer
 * underneath carries the colours. Everything the mirror renders has to be the
 * phrase character for character, or the caret would drift from the text.
 */

beforeEach(() => {
  document.body.replaceChildren();
});

const keys = (fragment) => [...fragment.querySelectorAll('.pagetree-facets__phrase-key')].map((span) => span.textContent);

describe('renderPhrase', () => {
  it('wraps each key with its colon and leaves the values and the spacing as text', () => {
    const fragment = renderPhrase('doktype:1,3  is:empty home');

    expect(keys(fragment)).toEqual(['doktype:', 'is:']);
    expect(fragment.textContent).toBe('doktype:1,3  is:empty home');
  });

  it('colours a key that is still being typed, before it has a value', () => {
    expect(keys(renderPhrase('doktype:1 is:'))).toEqual(['doktype:', 'is:']);
  });

  it('reads keys case-insensitively, as the parser does', () => {
    expect(keys(renderPhrase('Doktype:1'))).toEqual(['Doktype:']);
  });

  it('leaves quoted freetext and a value containing a colon alone', () => {
    const fragment = renderPhrase('"two words" title:"my:page" note:this');

    expect(keys(fragment)).toEqual(['title:', 'note:']);
    expect(fragment.textContent).toBe('"two words" title:"my:page" note:this');
  });

  it('renders an empty phrase as nothing', () => {
    expect(renderPhrase('').childNodes).toHaveLength(0);
  });
});

describe('buildPhraseField', () => {
  const mount = (value = '') => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    const field = buildPhraseField(input);
    document.body.append(field.element);

    return { input, ...field };
  };

  it('places a hidden-from-AT mirror under the input and renders the initial value into it', () => {
    const { element, input } = mount('is:hidden');
    const mirror = element.querySelector('.pagetree-facets__phrase-mirror');

    expect(element.lastElementChild).toBe(input);
    expect(mirror.getAttribute('aria-hidden')).toBe('true');
    expect(mirror.textContent).toBe('is:hidden');
    expect(keys(mirror)).toEqual(['is:']);
  });

  it('follows typing and a programmatic refresh', () => {
    const { element, input, refresh } = mount();
    const mirror = element.querySelector('.pagetree-facets__phrase-mirror');

    input.value = 'doktype:1';
    input.dispatchEvent(new Event('input'));
    expect(mirror.textContent).toBe('doktype:1');

    input.value = 'is:empty';
    refresh();
    expect(mirror.textContent).toBe('is:empty');
  });

  it('scrolls the mirror with the input, so a long phrase stays aligned', () => {
    const { element, input } = mount('a'.repeat(200));
    const mirror = element.querySelector('.pagetree-facets__phrase-mirror');
    Object.defineProperty(input, 'scrollLeft', { value: 37 });

    input.dispatchEvent(new Event('scroll'));

    expect(mirror.scrollLeft).toBe(37);
  });

  it('measures where a character sits, from the field edge and minus the scroll', () => {
    const { element, input, caretLeft } = mount('doktype:1 is:empty');
    const probe = element.querySelector('.pagetree-facets__phrase-probe');
    let measured;
    probe.getBoundingClientRect = () => {
      measured = probe.textContent;

      return { width: 80 };
    };
    Object.defineProperty(input, 'scrollLeft', { value: 10 });

    expect(caretLeft(10)).toBe(70);
    expect(measured).toBe('doktype:1 ');
  });
});
