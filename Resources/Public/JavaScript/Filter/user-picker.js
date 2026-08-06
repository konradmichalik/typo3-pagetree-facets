/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import AjaxRequest from '@typo3/core/ajax/ajax-request.js';

/**
 * Typeahead over be_users, backed by a small debounced AJAX search - one single
 * mechanism, not a search box plus a separate "Me" toggle (the two used to show
 * redundant, unstyled "Me"/"Me" text next to each other with no indication which
 * one was actually selected). "Me" is pinned as the first suggestion whenever the
 * dropdown opens, using the current user's own record the server already has in
 * memory (no round trip).
 *
 * The input's visible value is a display label ("Me (admin)" or a picked user's
 * own label); the value actually serialized lives in `input.dataset.value` (uid or
 * "me"), flagged by `dataset.picker`. That dataset pair is the entire contract with
 * the modal: its generic collectors read it instead of the visible text, so
 * mid-typing input never counts as a criterion.
 *
 * ARIA "combobox with list autocomplete" pattern (WAI-ARIA APG): the input keeps
 * real DOM focus at all times, arrow keys move a highlighted suggestion via
 * aria-activedescendant, Enter selects it. This is not decoration - the suggestion
 * list is reparented far from the input in the DOM (see #show), so plain Tab-key
 * focus movement into it is either unreachable or lands wildly out of sequence;
 * letting the browser's native Tab handling try was a real keyboard trap before
 * this rewrite (Tab moved focus nowhere useful, and the list would hide itself out
 * from under a focus that did land inside it).
 */

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
/** Long enough for a click outside to register before the list disappears. */
const BLUR_HIDE_DELAY_MS = 150;

/**
 * Hide-callbacks of currently open dropdowns. Their scroll listeners live on
 * `document`, so closing the modal with a dropdown still open (blur does not fire
 * on element removal) must run them explicitly, or the listeners would outlive the
 * modal and retain its detached DOM.
 */
const openDropdowns = new Set();

/** Only ever used to make suggestion-list ids unique. */
let nextListId = 0;

/**
 * Close every open dropdown and drop its document-level scroll listener. The modal
 * calls this while tearing down.
 */
export function closeOpenUserDropdowns() {
  [...openDropdowns].forEach((hide) => hide());
}

/**
 * @param {object} tab - the owning tab, for the control's name
 * @param {object} field - field descriptor; `field.currentUser` pins the "Me" entry
 * @param {string|string[]|undefined} state - hydrated value ("me" or a uid)
 * @param {{
 *   getRoot: () => HTMLElement,
 *   clearable: (input: HTMLInputElement) => HTMLElement,
 *   onLabelResolved: () => void,
 * }} deps
 * @returns {HTMLElement} the control, ready to append
 */
export function renderUserPicker(tab, field, state, deps) {
  return new UserPicker(tab, field, state, deps).element;
}

class UserPicker {
  #input;
  #results;
  #resultsId;
  #currentUser;
  #currentUserLabel;
  #deps;
  #element;
  #highlighted = -1;
  #debounceTimer = null;
  /**
   * Guards against out-of-order AJAX responses: clearTimeout() only cancels a
   * debounced search that has not fired yet, not one already in flight. Typing
   * fast enough that an older request resolves after a newer one would otherwise
   * let the stale response overwrite the newer, correct suggestions - each input
   * event bumps the token, and a response is only applied if it is still the most
   * recent one requested.
   */
  #searchToken = 0;
  #hideOnScroll = null;

  constructor(tab, field, state, deps) {
    this.#deps = deps;
    this.#resultsId = `pagetree-facets__user-results-${nextListId++}`;

    const meLabel = TYPO3.lang?.['pagetreeFacets.modal.me'] ?? 'Me';
    this.#currentUser = field.currentUser?.uid ? field.currentUser : null;
    this.#currentUserLabel = this.#currentUser ? `${meLabel} (${this.#currentUser.username})` : meLabel;

    this.#input = this.#buildInput(tab, field);
    this.#results = this.#buildResults();
    this.#input.setAttribute('aria-controls', this.#resultsId);

    this.#seedFromState(state);
    this.#bindInputEvents();

    this.#element = document.createElement('div');
    this.#element.className = 'pagetree-facets__user-picker';
    this.#element.append(deps.clearable(this.#input), this.#results);
  }

  get element() {
    return this.#element;
  }

  #buildInput(tab, field) {
    const input = document.createElement('input');
    input.className = 'form-control';
    input.type = 'text';
    input.name = `${tab.identifier}[${field.name}]`;
    input.autocomplete = 'off';
    input.placeholder = TYPO3.lang?.['pagetreeFacets.modal.userSearchPlaceholder'] ?? 'Search backend user…';
    // Marks this control as "dataset.value is the source of truth" - the typed
    // text is a display-only query until a suggestion is picked, so the generic
    // collectors must never treat mid-typing text as a criterion.
    input.dataset.picker = '1';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');

    return input;
  }

  #buildResults() {
    const results = document.createElement('ul');
    results.id = this.#resultsId;
    results.className = 'pagetree-facets__user-results list-unstyled';
    results.setAttribute('role', 'listbox');
    results.hidden = true;

    return results;
  }

  /**
   * "me" resolves from the record already at hand; a bare uid needs a round trip
   * for its label, and the re-check guards against the user having moved on to
   * another value while that was in flight.
   */
  #seedFromState(state) {
    const existing = Array.isArray(state) ? (state[0] ?? '') : (state ?? '');
    if ('me' === existing && this.#currentUser) {
      this.#input.value = this.#currentUserLabel;
      this.#input.dataset.value = 'me';
      this.#input.dataset.label = this.#currentUserLabel;

      return;
    }
    if (!existing) {
      return;
    }
    this.#input.value = existing;
    this.#input.dataset.value = existing;
    resolveUserLabel(existing).then((label) => {
      if (label && this.#input.dataset.value === existing) {
        this.#input.value = label;
        this.#input.dataset.label = label;
        this.#deps.onLabelResolved();
      }
    });
  }

  #bindInputEvents() {
    // Pin "Me" as a suggestion the moment the field gains focus, before any typing
    // - the common case (filter by my own edits) needs no search at all.
    this.#input.addEventListener('focus', () => {
      if (this.#input.value.trim().length < MIN_QUERY_LENGTH) {
        this.#searchToken += 1;
        this.#renderSuggestions([]);
      }
    });
    this.#input.addEventListener('input', () => this.#onInput());
    this.#input.addEventListener('keydown', (event) => this.#onKeydown(event));
    this.#input.addEventListener('blur', () => {
      // Delayed so a mouse click outside the input (that isn't one of our own
      // suggestion buttons, which prevent this via mousedown below) still gets a
      // chance to register before the list disappears.
      window.setTimeout(() => this.#hide(), BLUR_HIDE_DELAY_MS);
    });
  }

  #onInput() {
    delete this.#input.dataset.value;
    delete this.#input.dataset.label;
    window.clearTimeout(this.#debounceTimer);
    const query = this.#input.value.trim();
    const token = ++this.#searchToken;
    if (query.length < MIN_QUERY_LENGTH) {
      this.#renderSuggestions([]);

      return;
    }
    this.#debounceTimer = window.setTimeout(async () => {
      const users = await searchUsers(query);
      if (token !== this.#searchToken) {
        return; // a newer query has started since - this response is stale
      }
      this.#renderSuggestions(users);
    }, SEARCH_DEBOUNCE_MS);
  }

  #onKeydown(event) {
    if ('ArrowDown' === event.key) {
      event.preventDefault();
      if (this.#results.hidden) {
        if (this.#results.children.length) {
          this.#show();
        } else {
          this.#renderSuggestions([]);
        }
      }
      this.#setHighlighted(this.#highlighted + 1);
    } else if ('ArrowUp' === event.key && !this.#results.hidden) {
      event.preventDefault();
      this.#setHighlighted(this.#highlighted - 1);
    } else if ('Enter' === event.key && !this.#results.hidden && this.#highlighted > -1) {
      event.preventDefault();
      // Also stops this Enter from reaching the modal-wide "Enter applies and
      // closes" handler (bound higher up on .pagetree-facets) - picking a
      // suggestion should not also apply/close the whole modal.
      event.stopPropagation();
      this.#options()[this.#highlighted].click();
    } else if ('Escape' === event.key && !this.#results.hidden) {
      event.preventDefault();
      this.#hide();
    }
  }

  #options() {
    return Array.from(this.#results.querySelectorAll('[role="option"]'));
  }

  #setHighlighted(index) {
    const items = this.#options();
    this.#highlighted = items.length ? ((index % items.length) + items.length) % items.length : -1;
    for (const [i, item] of items.entries()) {
      const isActive = i === this.#highlighted;
      item.classList.toggle('is-highlighted', isActive);
      item.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
    if (this.#highlighted > -1) {
      this.#input.setAttribute('aria-activedescendant', items[this.#highlighted].id);
    } else {
      this.#input.removeAttribute('aria-activedescendant');
    }
  }

  #renderSuggestions(users) {
    this.#results.replaceChildren();
    const items = this.#currentUser ? [{ value: 'me', label: this.#currentUserLabel }, ...users] : users;
    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.append(this.#buildOption(item, index));
      this.#results.append(li);
    });
    this.#highlighted = -1;
    if (items.length) {
      this.#show();
    } else {
      this.#hide();
    }
  }

  #buildOption(item, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `${this.#resultsId}-option-${index}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    // Reached via the input's own arrow-key handling, not Tab - a real tabindex
    // would put it back in the same broken position as before.
    button.tabIndex = -1;
    button.className = 'pagetree-facets__user-result';
    button.textContent = item.label;
    // Keeps focus on the input for mouse clicks too, so selecting a suggestion
    // never needs the blur/setTimeout dance to "just work".
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => this.#select(String(item.value ?? item.uid), item.label));

    return button;
  }

  #select(value, label) {
    this.#input.value = label;
    this.#input.dataset.value = value;
    this.#input.dataset.label = label;
    this.#hide();
    this.#input.focus();
    this.#input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * The dropdown lives inside .pagetree-facets__panels, which scrolls its own
   * content - an absolutely positioned child gets clipped by that overflow once
   * the input sits near the bottom of the visible area. Reparenting it to the
   * modal root and positioning it `absolute` against that same root (coordinates
   * relative to its own bounding box, not the viewport) escapes that clipping
   * entirely. Deliberately not `fixed`: the modal dialog may itself establish a
   * containing block (e.g. a transform-based open animation), which would silently
   * reinterpret viewport coordinates against the dialog's box instead -
   * .pagetree-facets never clips its own children, so `absolute` against it is the
   * safer bet.
   *
   * The root only has to exist by the time something can be shown, which is after
   * the modal finished rendering - not while the fields are being built.
   */
  #show() {
    const root = this.#deps.getRoot();
    if (this.#results.parentElement !== root) {
      root.append(this.#results);
    }
    const rootRect = root.getBoundingClientRect();
    const inputRect = this.#input.getBoundingClientRect();
    this.#results.style.position = 'absolute';
    this.#results.style.left = `${inputRect.left - rootRect.left}px`;
    this.#results.style.top = `${inputRect.bottom - rootRect.top + 4}px`;
    this.#results.style.width = `${inputRect.width}px`;
    this.#results.hidden = false;
    this.#input.setAttribute('aria-expanded', 'true');

    if (null === this.#hideOnScroll) {
      // Scroll events on inner scrollable containers do not bubble - a capture
      // listener still sees them on the way down, regardless of which ancestor
      // scrolled.
      this.#hideOnScroll = () => this.#hide();
      document.addEventListener('scroll', this.#hideOnScroll, true);
      openDropdowns.add(this.#hideOnScroll);
    }
  }

  #hide() {
    this.#results.hidden = true;
    this.#input.setAttribute('aria-expanded', 'false');
    this.#input.removeAttribute('aria-activedescendant');
    if (null !== this.#hideOnScroll) {
      document.removeEventListener('scroll', this.#hideOnScroll, true);
      openDropdowns.delete(this.#hideOnScroll);
      this.#hideOnScroll = null;
    }
  }
}

/**
 * @returns {Promise<Array<{uid: number, label: string}>>} empty on failure - a
 *   broken suggestion lookup must not break typing.
 */
async function searchUsers(query) {
  const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_users)
    .withQueryArguments({ q: query })
    .get();
  const { users } = await response.resolve();

  return users;
}

async function resolveUserLabel(uid) {
  try {
    const response = await new AjaxRequest(TYPO3.settings.ajaxUrls.typo3_pagetree_facets_users)
      .withQueryArguments({ uid })
      .get();
    const { users } = await response.resolve();

    return users[0]?.label ?? null;
  } catch {
    return null;
  }
}
