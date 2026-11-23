/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import Hotkeys from '@typo3/backend/hotkeys.js';
import { appendRichText, decorativeIcon, lang, uniqueId } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { attachPopover } from '@konradmichalik/pagetree-facets/Filter/popover.js';

/**
 * The help popover, opened from `How filtering works` under the navigation and
 * placed next to it over the content, so it never pushes anything down.
 */

// Each token exists in the code (DoktypeTab, Option/State, core's CType,
// ActivityTab::PRESETS); the language key holds what it does.
const EXAMPLE_TOKENS = [
  ['doktype:1,3', 'doktype', 'page type, comma means or'],
  ['is:empty', 'is', 'page state'],
  ['ce:uploads', 'ce', 'contains this element type'],
  ['updated:<30d', 'updated', 'changed in the last 30 days'],
  ['by:me', 'by', 'last edited by you'],
];

/**
 * @param {{getLayout: () => {root: HTMLElement, nav: HTMLElement}}} options - the
 *   modal content and its navigation, read on open: the popover is placed from
 *   the navigation's edge within the content
 * @returns {{link: HTMLElement, panel: HTMLElement, close: () => void}} the link
 *   goes under the navigation, the panel anywhere in the content
 */
export function buildHelp({ getLayout }) {
  const panel = buildPanel();
  const link = buildLink(panel.id);
  const popover = attachPopover({
    trigger: link,
    panel,
    onOpen: () => {
      place(panel, getLayout());
      panel.focus();
    },
  });
  panel.append(buildClose(() => popover.close(true)));

  return { link, panel, close: () => popover.close() };
}

function buildLink(panelId) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'btn btn-link pagetree-facets__help-link';
  link.title = lang('pagetreeFacets.modal.help.description', 'Explains how criteria combine and what each action does.');
  link.setAttribute('aria-controls', panelId);
  link.setAttribute('aria-haspopup', 'dialog');
  link.append(decorativeIcon('actions-question-circle'), document.createTextNode(lang('pagetreeFacets.modal.help', 'How filtering works')));

  return link;
}

function buildPanel() {
  const panel = document.createElement('div');
  panel.className = 'pagetree-facets__help';
  panel.id = uniqueId('pagetree-facets__help');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  // Focus lands on the dialog itself, so the name is announced before the text.
  panel.tabIndex = -1;

  const title = document.createElement('h2');
  title.className = 'pagetree-facets__help-title';
  title.id = uniqueId('pagetree-facets__help-title');
  title.textContent = lang('pagetreeFacets.modal.help', 'How filtering works');
  panel.setAttribute('aria-labelledby', title.id);
  panel.append(title);

  panel.append(
    section('combine', 'Combining criteria', [buildIllustration(), paragraph('combine.text', 'Within one category, any choice is enough. Across categories, a page must match all of them.')]),
    section('apply', 'Nothing changes until you apply', [paragraph('apply.text', 'The count at the bottom previews the result. The page tree only updates once you choose Apply.')]),
    section('share', 'Keep and share', [paragraph('share.text', 'The actions menu next to Clear all saves a filter as a favorite or copies a link to it for a colleague.')]),
    section('typing', 'Prefer typing?', [paragraph('typing.text', 'Switch to Text, or type straight into the page tree search field:'), buildTokens()]),
    buildGlobalSearch(),
  );

  return panel;
}

function section(key, fallbackTitle, children) {
  const wrap = document.createElement('section');
  wrap.className = 'pagetree-facets__help-section';
  const heading = document.createElement('h3');
  heading.textContent = lang(`pagetreeFacets.modal.help.${key}.title`, fallbackTitle);
  wrap.append(heading, ...children);

  return wrap;
}

function paragraph(key, fallback) {
  const text = document.createElement('p');
  text.textContent = lang(`pagetreeFacets.modal.help.${key}`, fallback);

  return text;
}

// `Standard Page or Link and Hidden`: two values of one facet, then another facet.
function buildIllustration() {
  const row = document.createElement('p');
  row.className = 'pagetree-facets__help-chips';
  const chip = (key, fallback) => {
    const span = document.createElement('span');
    span.className = 'pagetree-facets__help-chip';
    span.textContent = lang(`pagetreeFacets.modal.help.combine.${key}`, fallback);

    return span;
  };
  const word = (key, fallback) => {
    const strong = document.createElement('strong');
    strong.textContent = lang(`pagetreeFacets.modal.help.combine.${key}`, fallback);

    return strong;
  };
  row.append(chip('exampleA', 'Standard Page'), ' ', word('or', 'or'), ' ', chip('exampleB', 'Link'), ' ', word('and', 'and'), ' ', chip('exampleC', 'Hidden'));

  return row;
}

function buildTokens() {
  const list = document.createElement('dl');
  list.className = 'pagetree-facets__help-tokens';
  for (const [token, key, fallback] of EXAMPLE_TOKENS) {
    const term = document.createElement('dt');
    const code = document.createElement('code');
    code.textContent = token;
    term.append(code);
    const description = document.createElement('dd');
    description.textContent = lang(`pagetreeFacets.modal.help.token.${key}`, fallback);
    list.append(term, description);
  }

  return list;
}

// Core resolves the modifier per platform; the text names the same key.
function buildGlobalSearch() {
  const text = document.createElement('p');
  text.className = 'pagetree-facets__help-global';
  const fallback = 'Looking for one record itself? The Records category here only narrows the tree to pages that contain such records. To open a record directly, use the global backend search: ';
  appendRichText(text, 'meta' === Hotkeys.normalizedCtrlModifierKey
    ? lang('pagetreeFacets.modal.help.globalSearch.cmd', `${fallback}[[Cmd]] [[K]]`)
    : lang('pagetreeFacets.modal.help.globalSearch.ctrl', `${fallback}[[Ctrl]] [[K]]`));

  return text;
}

function buildClose(onClose) {
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pagetree-facets__help-close';
  close.setAttribute('aria-label', lang('pagetreeFacets.modal.close', 'Close'));
  close.title = lang('pagetreeFacets.modal.help.close.description', 'Closes the help.');
  close.append(decorativeIcon('actions-close'));
  close.addEventListener('click', onClose);

  return close;
}

// Next to the navigation, bottom edge level with the link: measured on open,
// since the navigation's width is the layout's, not ours.
function place(panel, { root, nav }) {
  const content = root.getBoundingClientRect();
  const navigation = nav.getBoundingClientRect();
  panel.style.insetInlineStart = `${navigation.right - content.left + 8}px`;
  panel.style.bottom = `${content.bottom - navigation.bottom}px`;
}
