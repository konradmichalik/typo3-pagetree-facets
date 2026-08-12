/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configurationFixture, control, openModal, requests, resetHarness, urls,
} from './Support/modal-harness.js';

function enableLivePreviewCount() {
  globalThis.TYPO3.settings.PagetreeFacets = { livePreviewCount: '1' };
}

function matchCount(modal) {
  return modal.querySelector('.pagetree-facets__match-count');
}

/**
 * A configuration whose hydrated Page type state depends on the requested
 * phrase - mirrors `hydratingFixture` in facets-modal-token-view.test.js.
 * Needed so "the modal opens with an already-active baseline" is represented
 * honestly: the real endpoint would answer a `doktype:1` open with the
 * `doktype` tab's state already containing `1`, not an empty form that
 * happens to have a phrase string attached to it.
 */
function hydratingDoktypeFixture(phrase) {
  const configuration = configurationFixture();
  configuration.tabs[0].state = phrase.includes('doktype:1') ? { doktype: ['1'] } : {};

  return configuration;
}

beforeEach(() => {
  resetHarness();
});

describe('when the setting is off (default)', () => {
  it('never renders the match count or requests one', async () => {
    const { modal } = await openModal({ count: 3 });

    expect(matchCount(modal)).toBeNull();

    control(modal, 'doktype[doktype]', '1').click();
    await new Promise((resolve) => { setTimeout(resolve, 400); });

    expect(requests().some((request) => request.url === urls.count)).toBe(false);
  });
});

describe('when the setting is on', () => {
  it('shows a count as soon as the modal opens, when the baseline already has active criteria', async () => {
    enableLivePreviewCount();
    // A fresh, criterion-less open gets `count: null` from the real endpoint
    // (FilterResolutionService::resolve()/count() return null when nothing is
    // active) and the notice stays hidden - see the "count is null" test above.
    // An immediate, non-debounced count is only realistic when the baseline
    // reopens onto an already-filtered tree, so that's what this test opens with.
    const { modal } = await openModal({ phrase: 'doktype:1', count: 4, configuration: hydratingDoktypeFixture('doktype:1') });

    await expect.poll(() => matchCount(modal)?.textContent).toBe('4 matching pages');
    expect(matchCount(modal).hidden).toBe(false);
  });

  it('uses the singular label for exactly one match', async () => {
    enableLivePreviewCount();
    const { modal } = await openModal({ count: 1 });

    await expect.poll(() => matchCount(modal)?.textContent).toBe('1 matching page');
  });

  it('uses the zero label and stays visible for no matches', async () => {
    enableLivePreviewCount();
    const { modal } = await openModal({ count: 0 });

    await expect.poll(() => matchCount(modal)?.textContent).toBe('No matching pages');
    expect(matchCount(modal).hidden).toBe(false);
  });

  it('hides the notice when the count is null (nothing resolvable)', async () => {
    enableLivePreviewCount();
    const { modal } = await openModal({ count: null });

    await expect.poll(() => matchCount(modal)?.hidden).toBe(true);
  });

  it('debounces rapid changes into a single follow-up request', async () => {
    enableLivePreviewCount();
    let calls = 0;
    const { modal } = await openModal({
      count: () => { calls += 1; return 7; },
    });
    await expect.poll(() => calls).toBe(1); // the initial, undebounced population

    control(modal, 'doktype[doktype]', '1').click();
    control(modal, 'state[is]', 'hidden').click();
    control(modal, 'state[is]', 'empty').click();

    await expect.poll(() => calls).toBe(2);
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    expect(calls).toBe(2); // no further requests once the debounce window passed
  });

  it('drops a response overtaken by a later change', async () => {
    enableLivePreviewCount();
    let releaseFirst;
    const gate = new Promise((resolve) => { releaseFirst = resolve; });
    let seenFirstRequest = false;
    const { modal } = await openModal({
      count: async () => {
        if (!seenFirstRequest) {
          seenFirstRequest = true;
          await gate;
          return 111; // stale - must never reach the DOM
        }
        return 2;
      },
    });
    await expect.poll(() => matchCount(modal)?.textContent).not.toBe('');

    control(modal, 'doktype[doktype]', '1').click();
    await new Promise((resolve) => { setTimeout(resolve, 400); }); // let the first request start and hang on the gate
    control(modal, 'state[is]', 'hidden').click();
    await expect.poll(() => matchCount(modal)?.textContent).toBe('2 matching pages');

    releaseFirst();
    await new Promise((resolve) => { setTimeout(resolve, 20); });

    expect(matchCount(modal).textContent).toBe('2 matching pages');
  });

  it('hides the count while in token mode and resumes on exit', async () => {
    enableLivePreviewCount();
    const { modal } = await openModal({ count: 4 });
    await expect.poll(() => matchCount(modal)?.hidden).toBe(false);

    // Entering token mode awaits #computePhrase() (a serialize round trip)
    // before flipping #tokenMode and hiding the notice, so this can't be a
    // synchronous assertion right after click() - poll for it like the other
    // assertions in this suite that depend on an AJAX round trip.
    modal.querySelector('.pagetree-facets__token-toggle').click();
    await expect.poll(() => matchCount(modal)?.hidden).toBe(true);

    modal.querySelector('.pagetree-facets__token-toggle').click();
    await expect.poll(() => matchCount(modal)?.hidden).toBe(false);
  });

  it('reflects the site scope and freetext, not just tab criteria', async () => {
    enableLivePreviewCount();
    const configuration = configurationFixture({ sites: [{ identifier: 'main' }, { identifier: 'other' }] });
    const seenPayloads = [];
    const { modal } = await openModal({
      configuration,
      count: (payload) => { seenPayloads.push(payload); return 3; },
    });
    await expect.poll(() => seenPayloads.length).toBeGreaterThan(0);

    modal.querySelector('[data-role="site-scope"]').value = 'main';
    modal.querySelector('[data-role="site-scope"]').dispatchEvent(new Event('change', { bubbles: true }));

    await expect.poll(() => seenPayloads.at(-1)?.site).toBe('main');
  });
});
