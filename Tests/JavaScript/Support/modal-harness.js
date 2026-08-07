import { vi } from 'vitest';
import FacetsModal from '@konradmichalik/pagetree-facets/facets-modal.js';
import { lastModal, openedModals, resetModalStub } from '../Stubs/typo3/backend/modal.js';
import { resetNotificationStub } from '../Stubs/typo3/backend/notification.js';
import { requests, resetAjaxStub, respondWith } from '../Stubs/typo3/core/ajax/ajax-request.js';

/*
 * Shared setup for the facets-modal suites: the endpoint URLs, a configuration
 * fixture shaped like what FacetsModalController answers with, and the two steps
 * every test needs before it can touch anything (await open(), then let the
 * modal know it is on screen).
 *
 * The serialize endpoint is answered by `fakeSerialize()` below rather than by
 * the real TokenSerializer, which lives in PHP and is tested there. It only has
 * to be *a* deterministic phrase derived from the posted state, since what these
 * suites assert about it is that the modal posts the right state and hands the
 * answer on unchanged - never how a phrase is spelled.
 */

export const urls = {
  configuration: '/ajax/configuration',
  serialize: '/ajax/serialize',
  favoriteAdd: '/ajax/favorite/add',
  favoriteRemove: '/ajax/favorite/remove',
  users: '/ajax/users',
};

/** The one be_user the users endpoint knows about, for user-picker fields. */
export const knownUser = { uid: 5, label: 'Editor (editor)' };

/**
 * A configuration with the field types the modal treats differently: a checkbox
 * group with options, one with none (the "empty tab" case), a grouped and an
 * ungrouped tab, a select, and a tab with two same-named-once fields (which is
 * what makes chips carry the field label instead of the tab label).
 */
export function configurationFixture(overrides = {}) {
  return {
    tabs: [
      {
        identifier: 'doktype',
        label: 'Page type',
        group: 'Content',
        state: {},
        configuration: {
          fields: [{
            type: 'checkbox-group',
            name: 'doktype',
            label: 'Page type',
            options: [
              { value: '1', label: 'Standard' },
              { value: '4', label: 'Shortcut' },
            ],
          }],
        },
      },
      {
        identifier: 'state',
        label: 'Page state',
        group: 'Content',
        state: { is: ['hidden'] },
        configuration: {
          fields: [{
            type: 'checkbox-group',
            name: 'is',
            label: 'State',
            options: [
              { value: 'hidden', label: 'Hidden' },
              { value: 'empty', label: 'Empty', description: 'Pages without content' },
            ],
          }],
        },
      },
      {
        identifier: 'translations',
        label: 'Translations',
        group: null,
        state: {},
        // No options at all: a single-language site renders this tab unusable,
        // which is what #isTabEmpty() reacts to.
        configuration: { fields: [{ type: 'checkbox-group', name: 'lang', label: 'Language', options: [] }] },
      },
      {
        identifier: 'activity',
        label: 'Activity',
        state: {},
        configuration: {
          fields: [
            { type: 'text', name: 'changed', label: 'Last updated', placeholder: '7d' },
            { type: 'text', name: 'created', label: 'Created' },
          ],
        },
      },
    ],
    sites: [{ identifier: 'main' }, { identifier: 'other' }],
    activeSite: '',
    pageScope: null,
    freetext: '',
    favorites: [],
    ...overrides,
  };
}

/** A stand-in for TokenSerializer: deterministic, and readable in assertions. */
export function fakeSerialize({ states, site, pageScope, freetext }) {
  const parts = [];
  for (const state of Object.values(states)) {
    for (const [field, values] of Object.entries(state)) {
      parts.push(`${field}:${values.join(',')}`);
    }
  }
  if ('' !== site) {
    parts.push(`site:${site}`);
  }
  if (pageScope > 0) {
    parts.push(`under:${pageScope}`);
  }
  if ('' !== freetext.trim()) {
    parts.push(freetext.trim());
  }

  return parts.join(' ');
}

export function resetHarness() {
  // FacetsModal is exported as a singleton, so a debounce or token-view timer left
  // running by the previous test would fire against *this* test's modal. The
  // modal's own teardown is what cancels them, so trigger it here rather than
  // relying on every test closing the modal it opened.
  for (const { element } of openedModals()) {
    element.dispatchEvent(new CustomEvent('typo3-modal-hidden', { bubbles: true }));
  }
  document.body.replaceChildren();
  resetAjaxStub();
  resetModalStub();
  resetNotificationStub();
  globalThis.TYPO3 = {
    lang: {},
    settings: {
      ajaxUrls: {
        typo3_pagetree_facets_configuration: urls.configuration,
        typo3_pagetree_facets_serialize: urls.serialize,
        typo3_pagetree_facets_favorite_add: urls.favoriteAdd,
        typo3_pagetree_facets_favorite_remove: urls.favoriteRemove,
        typo3_pagetree_facets_users: urls.users,
      },
    },
  };
}

/**
 * Opens the modal and reports it as shown, which is when it establishes its
 * baseline (see open()'s 'typo3-modal-shown' listener) - without that step no
 * assertion about chips or the Apply button means anything.
 *
 * @param {{phrase?: string, pageId?: number|null, configuration?: object|Function,
 *   favorites?: Array, onApply?: Function}} options - `configuration` may be a
 *   function of the requested phrase, which is what the token view needs.
 * @returns {Promise<{modal: HTMLElement|null, onApply: Function}>} `modal` is null
 *   when the configuration offered no tabs and nothing was opened.
 */
export async function openModal({
  phrase = '',
  pageId = 5,
  configuration = configurationFixture(),
  favorites = [],
  onApply = vi.fn(),
} = {}) {
  const configurationFor = 'function' === typeof configuration ? configuration : () => configuration;
  let stored = [...favorites];
  respondWith(async (payload, url) => {
    switch (url) {
      // Awaited, so a fixture may answer with a promise it resolves by hand -
      // which is how the token view's out-of-order responses are provoked.
      case urls.configuration:
        return { ...await configurationFor(payload.phrase), favorites: stored };
      case urls.serialize:
        return { phrase: fakeSerialize(payload) };
      case urls.favoriteAdd:
        stored = [...stored, { label: payload.label, tokenString: payload.tokenString }];

        return { favorites: stored };
      case urls.favoriteRemove:
        stored = stored.filter((_, index) => index !== payload.index);

        return { favorites: stored };
      case urls.users:
        return { users: String(knownUser.uid) === String(payload.uid) ? [knownUser] : [] };
      default:
        throw new Error(`unexpected endpoint ${url}`);
    }
  });

  await FacetsModal.open(phrase, pageId, onApply);
  const modal = lastModal()?.element ?? null;
  modal?.show();

  return { modal, onApply };
}

export { lastModal, openedModals, requests };

/** The Apply button lives in the modal's own footer, found by its name. */
export function applyButton(modal) {
  return modal.querySelector('button[name="pagetree-facets-apply"]');
}

export function footerButton(modal, text) {
  return [...modal.querySelectorAll('.t3js-modal-footer button')].find((button) => button.textContent === text);
}

export function navItem(modal, identifier) {
  return modal.querySelector(`.pagetree-facets__nav-item[data-tab="${identifier}"]`);
}

export function panel(modal, identifier) {
  return modal.querySelector(`.pagetree-facets__panel[data-panel="${identifier}"]`);
}

export function control(modal, name, value) {
  return value === undefined
    ? modal.querySelector(`[name="${name}"]`)
    : modal.querySelector(`[name="${name}"][value="${value}"]`);
}

/** Chip labels as one string each, e.g. `Page state: Hidden`. */
export function chipLabels(modal) {
  return [...modal.querySelectorAll('.pagetree-facets__chip')].map((chip) => [
    chip.querySelector('.pagetree-facets__chip-prefix').textContent,
    chip.querySelector('.pagetree-facets__chip-value').textContent,
  ].join(' '));
}

/** Types into a control the way a user would, so the modal's own listeners run. */
export function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
