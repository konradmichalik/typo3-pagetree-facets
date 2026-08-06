/**
 * Stand-in for @typo3/core/ajax/ajax-request.js.
 *
 * Mirrors only the fluent shape the extension uses:
 * `new AjaxRequest(url).withQueryArguments(args).get()` and `.post(body)`, both
 * resolving to an object with `.resolve()`. Tests drive it through
 * `respondWith`/`failWith` rather than by intercepting fetch, so no network layer
 * is involved at all.
 *
 * This deliberately does NOT try to imitate core's real behaviour beyond that
 * shape - a stub can only ever confirm what its author already believed.
 */
let handler = () => ({});
const calls = [];

export function respondWith(fn) {
  handler = fn;
}

export function failWith(error) {
  handler = () => {
    throw error;
  };
}

/** Every request made since the last reset: `{url, args}` or `{url, body}`, in order. */
export function requests() {
  return calls;
}

export function resetAjaxStub() {
  handler = () => ({});
  calls.length = 0;
}

export default class AjaxRequest {
  #url;
  #args = {};

  constructor(url) {
    this.#url = url;
  }

  withQueryArguments(args) {
    this.#args = args;

    return this;
  }

  async get() {
    calls.push({ url: this.#url, args: this.#args });
    const payload = await handler(this.#args);

    return { resolve: async () => payload };
  }

  async post(body) {
    calls.push({ url: this.#url, body });
    const payload = await handler(body);

    return { resolve: async () => payload };
  }
}
