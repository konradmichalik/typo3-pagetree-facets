/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configurationFixture, control, openModal, requests, resetButton, resetHarness, urls,
} from './Support/modal-harness.js';

function enableLivePreviewCount() {
  globalThis.TYPO3.settings.PagetreeFacets = { livePreviewCount: '1' };
}

function matchCount(modal) {
  return modal.querySelector('.pagetree-facets__match-count');
}

function skeleton(modal) {
  return matchCount(modal)?.querySelector('.pagetree-facets__match-count-skeleton');
}

function text(modal) {
  return matchCount(modal)?.querySelector('.pagetree-facets__match-count-text');
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

  it('does not flash the skeleton on open before the initial count settles', async () => {
    enableLivePreviewCount();
    const { modal } = await openModal({ phrase: 'doktype:1', count: 4, configuration: hydratingDoktypeFixture('doktype:1') });

    // #refreshActiveIndicators() runs ahead of the initial, non-debounced
    // #refreshCount() call below it - nothing has changed yet at that point,
    // just the baseline mirroring itself, so it must not show the skeleton
    // synchronously before #refreshCount()'s own threshold logic gets to.
    expect(skeleton(modal).hidden).toBe(true);

    await expect.poll(() => text(modal)?.textContent).toBe('4 matching pages');
  });

  it('never fires a count request or shows the skeleton when nothing is active on open', async () => {
    enableLivePreviewCount();
    const configuration = configurationFixture();
    configuration.tabs[1].state = {}; // clear the fixture's default active "state:hidden" criterion too
    let calls = 0;
    const { modal } = await openModal({
      configuration,
      count: () => { calls += 1; return null; },
    });

    // Long enough to catch a stray request or a delayed-show skeleton if the
    // guard were missing - #hasSavableFilter() being false must skip the
    // round trip entirely, not just win a timing race against it.
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    expect(calls).toBe(0);
    expect(matchCount(modal).hidden).toBe(true);
    expect(skeleton(modal).hidden).toBe(true);
  });

  it('does not show the skeleton when Reset clears the last active criterion', async () => {
    enableLivePreviewCount();
    const { modal } = await openModal({ phrase: 'doktype:1', count: 4, configuration: hydratingDoktypeFixture('doktype:1') });
    await expect.poll(() => text(modal)?.textContent).toBe('4 matching pages');

    resetButton(modal).click();

    // Nothing is active anymore, so there is nothing to recompute -
    // #scheduleCountRefresh() takes its "nothing active" branch and hides the
    // notice directly, the same as the fresh-open case above.
    expect(matchCount(modal).hidden).toBe(true);
    expect(skeleton(modal).hidden).toBe(true);
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

  it('shows the skeleton immediately on a change, before the debounced request even fires', async () => {
    enableLivePreviewCount();
    const { modal } = await openModal({ count: 4 });
    await expect.poll(() => text(modal)?.textContent).toBe('4 matching pages');
    expect(skeleton(modal).hidden).toBe(true);

    control(modal, 'doktype[doktype]', '1').click();

    // Synchronous, well before the 350ms debounce - the stale count must not
    // still be showing while a fresher one is pending, and the skeleton
    // doesn't wait for #refreshCount()'s own (much shorter) in-flight delay.
    expect(matchCount(modal).hidden).toBe(false);
    expect(skeleton(modal).hidden).toBe(false);
    expect(text(modal).hidden).toBe(true);
  });

  it('drops a response overtaken by a later change', async () => {
    enableLivePreviewCount();
    let releaseHung;
    const gate = new Promise((resolve) => { releaseHung = resolve; });
    let calls = 0;
    const { modal } = await openModal({
      count: async () => {
        calls += 1;
        if (2 === calls) {
          await gate;
          return 111; // stale - must never reach the DOM
        }
        return 1 === calls ? 1 : 2;
      },
    });
    // The initial, undebounced population - the redundant duplicate request this
    // notice used to race against is gone, so this is the one and only call so far.
    await expect.poll(() => matchCount(modal)?.textContent).toBe('1 matching page');

    control(modal, 'doktype[doktype]', '1').click(); // 2nd call - hangs on the gate
    await new Promise((resolve) => { setTimeout(resolve, 400); }); // let it start and hang on the gate
    control(modal, 'state[is]', 'hidden').click(); // 3rd call - resolves immediately
    await expect.poll(() => matchCount(modal)?.textContent).toBe('2 matching pages');

    releaseHung();
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

    modal.querySelector('[data-role="freetext"]').value = 'solar';
    modal.querySelector('[data-role="freetext"]').dispatchEvent(new Event('change', { bubbles: true }));

    await expect.poll(() => seenPayloads.at(-1)?.freetext).toBe('solar');
  });

  it('never shows the skeleton for a response faster than the loading threshold', async () => {
    enableLivePreviewCount();
    const { modal } = await openModal({ count: 5 });

    await expect.poll(() => text(modal)?.textContent).toBe('5 matching pages');
    expect(skeleton(modal).hidden).toBe(true);
  });

  it('shows the skeleton before a slow response arrives, then swaps to the real count', async () => {
    enableLivePreviewCount();
    const { modal } = await openModal({
      count: async () => {
        await new Promise((resolve) => { setTimeout(resolve, 250); });
        return 9;
      },
    });

    // The 10ms threshold is too short to assert a "nothing shown yet" instant
    // against with real timers (see the "never shows the skeleton for a fast
    // response" test above for that coverage) - so this test only asserts the
    // states either side of it: past the threshold, before the response
    // itself resolves (~250ms), the skeleton is the visible content.
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    expect(matchCount(modal).hidden).toBe(false);
    expect(skeleton(modal).hidden).toBe(false);
    expect(text(modal).hidden).toBe(true);

    // The response lands - skeleton is replaced by the resolved count.
    await expect.poll(() => text(modal)?.textContent).toBe('9 matching pages');
    expect(skeleton(modal).hidden).toBe(true);
    expect(text(modal).hidden).toBe(false);
  });

  it('reverts a shown skeleton instead of leaving it stuck when the request fails', async () => {
    enableLivePreviewCount();
    let calls = 0;
    const { modal } = await openModal({
      count: async () => {
        calls += 1;
        if (1 === calls) {
          return 3; // initial population - fast, succeeds
        }
        await new Promise((resolve) => { setTimeout(resolve, 250); }); // slow enough to cross the threshold
        throw new Error('simulated failure');
      },
    });
    await expect.poll(() => text(modal)?.textContent).toBe('3 matching pages');

    control(modal, 'doktype[doktype]', '1').click(); // 2nd call: slow, then fails

    // ~500ms elapsed: past the 350ms debounce + 10ms threshold (~360ms),
    // before the throw at ~600ms - the skeleton must be visible here, or the
    // "reverts" assertion below would be trivially true for the wrong reason.
    await new Promise((resolve) => { setTimeout(resolve, 500); });
    expect(skeleton(modal).hidden).toBe(false);

    // Past the throw (~600ms): reverted to the last known good count, not
    // stuck on the skeleton.
    await new Promise((resolve) => { setTimeout(resolve, 200); }); // total ~700ms
    expect(skeleton(modal).hidden).toBe(true);
    expect(text(modal).hidden).toBe(false);
    expect(text(modal).textContent).toBe('3 matching pages');
  });

  it('cancels a pending skeleton show when entering token mode before it fires', async () => {
    enableLivePreviewCount();
    let calls = 0;
    let modalRef;
    // The 10ms delayed-show threshold is too short to race against with a
    // real-timer wait chosen from outside (a 350ms debounce leaves only a
    // 10ms window to land the toggle in). Instead, the toggle happens inside
    // the mock itself, synchronously the moment the 2nd #refreshCount() call
    // starts - before anything yields to the event loop, so the pending
    // 10ms timer cannot have fired yet regardless of how short it is.
    const { modal } = await openModal({
      count: async () => {
        calls += 1;
        if (1 === calls) {
          return 3;
        }
        modalRef.querySelector('.pagetree-facets__token-toggle').click();
        await new Promise((resolve) => { setTimeout(resolve, 250); });
        return 9;
      },
    });
    modalRef = modal;
    await expect.poll(() => text(modal)?.textContent).toBe('3 matching pages');

    control(modal, 'doktype[doktype]', '1').click(); // 2nd call: slow, toggles token mode itself
    await expect.poll(() => matchCount(modal)?.hidden).toBe(true); // token mode's existing behavior

    // Let the slow response's resolution pass - it must not reopen the notice.
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    expect(matchCount(modal).hidden).toBe(true);
    expect(skeleton(modal).hidden).toBe(true);
  });
});
