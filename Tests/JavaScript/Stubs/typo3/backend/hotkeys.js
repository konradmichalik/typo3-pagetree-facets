/**
 * Stand-in for @typo3/backend/hotkeys.js.
 *
 * Mirrors only the shape facets-toolbar.js uses: the static
 * `normalizedCtrlModifierKey` property, and `register(keys, callback, options)`.
 * Registrations are recorded, not wired to any real keyboard event - there is
 * no dispatch mechanism here, so a test that cares about a hotkey firing calls
 * the recorded callback directly via `registeredHotkeys()`.
 *
 * This deliberately does NOT try to imitate core's real behaviour beyond that
 * shape - a stub can only ever confirm what its author already believed.
 */
const calls = [];

/** Every call to register() since the last reset: `{keys, callback, options}`, in order. */
export function registeredHotkeys() {
  return calls;
}

export function resetHotkeysStub() {
  calls.length = 0;
}

export default {
  normalizedCtrlModifierKey: 'ctrl',
  register(keys, callback, options) {
    calls.push({ keys, callback, options });
  },
};
