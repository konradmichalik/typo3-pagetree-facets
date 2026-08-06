/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */

/**
 * Cross-tab search over the criteria a modal currently offers.
 *
 * Matching happens purely on the labels already present in the hydrated
 * configuration - no request, no DOM. Only fields with enumerable options can
 * match: text inputs and the user picker carry no option list to search, so they
 * are skipped rather than half-matched on their field label.
 */
const SEARCHABLE_TYPES = ['checkbox-group', 'select', 'radio-presets'];

/**
 * @param {Array<{configuration: {fields?: Array<{type: string, options?: Array<{label: string}>}>}}>} tabs
 * @param {string} query - matched case-insensitively; normalizing here keeps the
 *   function independent of how the caller pre-processed its input.
 * @returns {Array<{tab: object, field: object, option: object}>}
 */
export function findFilterMatches(tabs, query) {
  const needle = query.trim().toLowerCase();
  if ('' === needle) {
    return [];
  }

  const matches = [];
  for (const tab of tabs) {
    for (const field of tab.configuration.fields ?? []) {
      if (!SEARCHABLE_TYPES.includes(field.type)) {
        continue;
      }
      for (const option of field.options ?? []) {
        if (option.label.toLowerCase().includes(needle)) {
          matches.push({ tab, field, option });
        }
      }
    }
  }

  return matches;
}
