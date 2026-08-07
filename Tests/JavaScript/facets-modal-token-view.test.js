import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyButton,
  chipLabels,
  configurationFixture,
  control,
  openModal,
  requests,
  resetHarness,
  type,
} from './Support/modal-harness.js';

/*
 * facets-modal.js, part three: token view - the raw phrase as an editable field
 * that stays in two-way sync with the (still editable) form.
 *
 * Both directions are debounced by 250ms, and the suite waits that out for real
 * rather than faking timers: the propagation is a timer *and* a round trip, and
 * polling for the outcome describes what the user sees without asserting how many
 * ticks it took.
 */

const enterTokenMode = async (modal) => {
  modal.querySelector('.pagetree-facets__token-toggle').click();
  await expect.poll(() => tokenField(modal).hidden).toBe(false);

  return tokenField(modal);
};

const tokenField = (modal) => modal.querySelector('[data-role="token-query"]');

/** A configuration whose hydrated Page state depends on the requested phrase. */
const hydratingFixture = (phrase) => {
  const configuration = configurationFixture();
  const values = ['hidden', 'empty'].filter((value) => phrase.includes(`is:${value}`));
  configuration.tabs[1].state = values.length ? { is: values } : {};

  return configuration;
};

beforeEach(() => {
  resetHarness();
});

describe('entering token view', () => {
  it('seeds the field from the form and hides the search controls', async () => {
    const { modal } = await openModal({ phrase: 'is:hidden', configuration: hydratingFixture('is:hidden') });

    const field = await enterTokenMode(modal);

    expect(field.value).toBe('is:hidden');
    expect(modal.querySelector('.pagetree-facets__token-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(modal.querySelector('.pagetree-facets__freetext').hidden).toBe(true);
    expect(modal.querySelector('.pagetree-facets__site').hidden).toBe(true);
  });

  it('leaves Apply disabled while the phrase still matches the tree', async () => {
    // The form-state baseline stops describing what is authoritative here, so the
    // typed phrase is diffed against the one already applied instead.
    const { modal } = await openModal({ phrase: 'is:hidden', configuration: hydratingFixture('is:hidden') });

    const field = await enterTokenMode(modal);
    expect(applyButton(modal).disabled).toBe(true);

    type(field, 'is:hidden doktype:1');

    // Typing refreshes the indicators debounced, so this is "shortly after the
    // keystroke", not "on it".
    await expect.poll(() => applyButton(modal).disabled).toBe(false);
  });

  it('drives the filter-wide actions off the typed field', async () => {
    const { modal } = await openModal({ phrase: 'is:hidden', configuration: hydratingFixture('is:hidden') });
    const field = await enterTokenMode(modal);
    expect(modal.querySelector('.pagetree-facets__actions').hidden).toBe(false);

    type(field, '   ');

    await expect.poll(() => modal.querySelector('.pagetree-facets__actions').hidden).toBe(true);
  });
});

describe('typing a phrase', () => {
  it('re-hydrates the whole form from it', async () => {
    const { modal } = await openModal({ configuration: hydratingFixture });
    const field = await enterTokenMode(modal);

    type(field, 'is:empty');

    await expect.poll(() => control(modal, 'state[is]', 'empty').checked).toBe(true);
    expect(control(modal, 'state[is]', 'hidden').checked).toBe(false);
    expect(chipLabels(modal)).toEqual(['Page state: Empty']);
  });

  it('drops a response overtaken by a later keystroke', async () => {
    let releaseFirst;
    const gate = new Promise((resolve) => { releaseFirst = resolve; });
    const { modal } = await openModal({
      configuration: (phrase) => (phrase.includes('empty')
        ? gate.then(() => hydratingFixture(phrase))
        : hydratingFixture(phrase)),
    });
    const field = await enterTokenMode(modal);

    type(field, 'is:empty');
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    type(field, 'is:hidden');
    await expect.poll(() => control(modal, 'state[is]', 'hidden').checked).toBe(true);

    releaseFirst();
    await new Promise((resolve) => { setTimeout(resolve, 20); });

    expect(control(modal, 'state[is]', 'empty').checked).toBe(false);
  });

  it('drops a response that arrives after token view was left', async () => {
    let releaseFirst;
    const gate = new Promise((resolve) => { releaseFirst = resolve; });
    const { modal } = await openModal({
      configuration: (phrase) => (phrase.includes('empty')
        ? gate.then(() => hydratingFixture(phrase))
        : hydratingFixture(phrase)),
    });
    const field = await enterTokenMode(modal);

    type(field, 'is:empty');
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    modal.querySelector('.pagetree-facets__token-toggle').click();
    // Picked in the restored form: rebuilding the panels would wipe it, which is
    // what makes this assertion say more than "empty is still unchecked".
    control(modal, 'doktype[doktype]', '1').click();

    releaseFirst();
    await new Promise((resolve) => { setTimeout(resolve, 20); });

    expect(control(modal, 'doktype[doktype]', '1').checked).toBe(true);
    expect(control(modal, 'state[is]', 'empty').checked).toBe(false);
  });
});

describe('editing the form in token view', () => {
  it('mirrors the change back into the phrase', async () => {
    const { modal } = await openModal({ phrase: 'is:hidden', configuration: hydratingFixture('is:hidden') });
    const field = await enterTokenMode(modal);

    control(modal, 'doktype[doktype]', '1').click();

    await expect.poll(() => field.value).toBe('doktype:1 is:hidden');
  });
});

describe('applying from token view', () => {
  it('hands the typed phrase on verbatim, so unrepresentable tokens survive', async () => {
    const { modal, onApply } = await openModal({ phrase: 'is:hidden', configuration: hydratingFixture('is:hidden') });
    const field = await enterTokenMode(modal);
    type(field, 'raw:tt_content|header=imprint');
    await expect.poll(() => applyButton(modal).disabled).toBe(false);
    const before = requests().length;

    applyButton(modal).click();

    await expect.poll(() => onApply.mock.calls).toEqual([['raw:tt_content|header=imprint']]);
    // No serialize round trip: re-serializing from the form would have dropped
    // the raw token the form cannot represent.
    expect(requests().slice(before)).toEqual([]);
  });
});

describe('leaving token view', () => {
  it('restores the search controls and the form-state baseline', async () => {
    const { modal } = await openModal({ phrase: 'is:hidden', configuration: hydratingFixture('is:hidden') });
    const field = await enterTokenMode(modal);

    modal.querySelector('.pagetree-facets__token-toggle').click();

    expect(field.hidden).toBe(true);
    expect(modal.querySelector('.pagetree-facets__freetext').hidden).toBe(false);
    expect(modal.querySelector('.pagetree-facets__token-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(applyButton(modal).disabled).toBe(true);
  });

  it('is forgotten by the next modal, which renders in form view', async () => {
    // Every field of this singleton outlives the modal it belonged to. While the
    // flag leaked, the reopened modal showed the form but treated the (fresh,
    // empty) phrase field as authoritative - Apply then cleared the tree filter.
    const first = await openModal({ phrase: 'is:hidden', configuration: hydratingFixture('is:hidden') });
    await enterTokenMode(first.modal);
    first.modal.hideModal();

    const { modal, onApply } = await openModal({ phrase: 'is:hidden', configuration: hydratingFixture('is:hidden') });

    expect(tokenField(modal).hidden).toBe(true);
    expect(modal.querySelector('.pagetree-facets__freetext').hidden).toBe(false);
    expect(applyButton(modal).disabled).toBe(true);
    // And the toggle enters token view rather than leaving it.
    const field = await enterTokenMode(modal);
    expect(field.value).toBe('is:hidden');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('empties the phrase field on Reset, so it cannot re-seed the cleared form', async () => {
    const { modal } = await openModal({ phrase: 'is:hidden', configuration: hydratingFixture('is:hidden') });
    const field = await enterTokenMode(modal);

    modal.querySelector('.pagetree-facets__reset').click();

    expect(field.value).toBe('');
    expect(control(modal, 'state[is]', 'hidden').checked).toBe(false);
  });
});
