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

/** The field types whose options are an enumerable list. */
export const CHOICE_FIELD_TYPES = ['checkbox-group', 'select', 'radio-presets'];

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

/**
 * Each distinct field with the name a criterion of it carries: the chips and the
 * key suggestions both read it. A bucketed field's labels are section headings,
 * so it is named after the tab; a single field would only repeat the tab, so it
 * is too. Only several non-bucketed fields are told apart by their own labels
 * (Activity: `Last updated` next to `Created`).
 *
 * @param {{label: string, configuration: {fields?: Array<{name: string, label: string}>}}} tab
 * @returns {Array<[object, string]>} field and its prefix, in field order
 */
export function criterionPrefixes(tab) {
  const fields = distinctFields(tab);
  const counts = fieldNameCounts(tab);
  const single = fields.filter((field) => 1 === counts.get(field.name));

  return fields.map((field) => [field, single.length > 1 && single.includes(field) ? field.label : tab.label]);
}
