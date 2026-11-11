/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */

/**
 * Syntax colours for the phrase in text mode. The input keeps the text, the
 * caret and the selection; a mirror layer underneath renders the same characters
 * with every `key:` coloured. The two line up because both are monospace and the
 * mirror copies the input's metrics, so the input's own text can be transparent.
 */

/**
 * TokenParser::PATTERN, with one relaxation: an empty bare value is allowed, so
 * a key is coloured while its value is still being typed.
 */
const TOKEN_PATTERN = /(?<key>[a-z][a-z0-9_-]*:)(?:"[^"]*"|[^\s"]*)|"[^"]*"|\S+/gi;

/** The metrics that decide where each character lands. */
const METRICS = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'paddingLeft', 'paddingRight'];

/**
 * The phrase as a fragment: each key with its colon in a span, everything else,
 * spacing included, as text. The text content equals the phrase character for character.
 *
 * @param {string} phrase
 * @returns {DocumentFragment}
 */
export function renderPhrase(phrase) {
  const fragment = document.createDocumentFragment();
  const appendText = (slice) => {
    if ('' !== slice) {
      fragment.append(slice);
    }
  };
  let lastIndex = 0;
  for (const found of phrase.matchAll(TOKEN_PATTERN)) {
    if (undefined === found.groups.key) {
      continue;
    }
    appendText(phrase.slice(lastIndex, found.index));
    const key = document.createElement('span');
    key.className = 'pagetree-facets__phrase-key';
    key.textContent = found.groups.key;
    fragment.append(key);
    lastIndex = found.index + found.groups.key.length;
  }
  appendText(phrase.slice(lastIndex));

  return fragment;
}

/**
 * Wraps the phrase input with its mirror.
 *
 * @param {HTMLInputElement} input
 * @returns {{element: HTMLElement, refresh: () => void, caretLeft: (index: number) => number}}
 *   `refresh` after a programmatic write, which fires no input event; `caretLeft`
 *   is where the character at `index` starts, in px from the element's edge
 */
export function buildPhraseField(input) {
  const element = document.createElement('div');
  element.className = 'pagetree-facets__phrase';

  const mirror = document.createElement('div');
  mirror.className = 'pagetree-facets__phrase-mirror';
  mirror.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'pagetree-facets__phrase-text';
  mirror.append(text);

  // Measures the text before the caret with the input's own metrics.
  const probe = document.createElement('span');
  probe.className = 'pagetree-facets__phrase-probe';
  probe.setAttribute('aria-hidden', 'true');

  const copyMetrics = (target) => {
    const computed = getComputedStyle(input);
    for (const metric of METRICS) {
      target.style[metric] = computed[metric];
    }
  };
  const refresh = () => {
    copyMetrics(text);
    text.replaceChildren(renderPhrase(input.value));
    mirror.scrollLeft = input.scrollLeft;
  };
  input.addEventListener('input', refresh);
  input.addEventListener('scroll', () => { mirror.scrollLeft = input.scrollLeft; });

  element.append(mirror, probe, input);
  refresh();

  return {
    element,
    refresh,
    caretLeft: (index) => {
      copyMetrics(probe);
      probe.textContent = input.value.slice(0, index);

      return probe.getBoundingClientRect().width - input.scrollLeft;
    },
  };
}
