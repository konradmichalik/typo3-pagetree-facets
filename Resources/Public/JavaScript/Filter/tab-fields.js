/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */

/**
 * Reading a tab's field list.
 *
 * A tab may spread one criterion over several fields that share a name - the
 * content element tab does, one field per wizard group, and the records tab
 * buckets its `table` field per source. Controls are looked up by name, so a
 * document-wide lookup for one such field already returns every control of that
 * name: walking the fields directly would then count each criterion once per
 * field. Both collectors therefore walk distinct names, which is what these two
 * functions provide.
 */

/**
 * The field list reduced to the first field per name, preserving order.
 *
 * @param {{configuration: {fields?: Array<{name: string}>}}} tab
 * @returns {Array<{name: string}>}
 */
export function distinctFields(tab) {
  const byName = new Map();
  for (const field of tab.configuration.fields ?? []) {
    if (!byName.has(field.name)) {
      byName.set(field.name, field);
    }
  }

  return [...byName.values()];
}

/**
 * How often each field name occurs in the raw (non-deduplicated) list. A count
 * above one marks a bucketed name, whose per-field `label` is a section heading
 * rather than a criterion name.
 *
 * @param {{configuration: {fields?: Array<{name: string}>}}} tab
 * @returns {Map<string, number>}
 */
export function fieldNameCounts(tab) {
  const counts = new Map();
  for (const field of tab.configuration.fields ?? []) {
    counts.set(field.name, (counts.get(field.name) ?? 0) + 1);
  }

  return counts;
}
