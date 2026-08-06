import { describe, expect, it } from 'vitest';
import { distinctFields, fieldNameCounts } from '@konradmichalik/pagetree-facets/Filter/tab-fields.js';

const tab = (...fields) => ({ configuration: { fields } });

describe('distinctFields', () => {
  it('keeps the first field per name', () => {
    const fields = distinctFields(tab(
      { name: 'ce', label: 'TYPO3 Core' },
      { name: 'ce', label: 'News' },
      { name: 'colPos', label: 'Column' },
    ));

    expect(fields.map((field) => field.label)).toEqual(['TYPO3 Core', 'Column']);
  });

  it('preserves the original order', () => {
    const fields = distinctFields(tab({ name: 'b' }, { name: 'a' }, { name: 'b' }));

    expect(fields.map((field) => field.name)).toEqual(['b', 'a']);
  });

  it('treats a tab without fields as empty', () => {
    // Tabs whose options all resolve to nothing render no fields at all - the
    // modal calls this before it knows that, so the absent key must not throw.
    expect(distinctFields({ configuration: {} })).toEqual([]);
  });
});

describe('fieldNameCounts', () => {
  it('counts raw occurrences, not distinct names', () => {
    const counts = fieldNameCounts(tab({ name: 'ce' }, { name: 'ce' }, { name: 'ce' }, { name: 'colPos' }));

    expect(counts.get('ce')).toBe(3);
    expect(counts.get('colPos')).toBe(1);
  });

  it('is what separates a bucketed criterion from a single-field one', () => {
    // A count above one means the field labels are section headings, so the chip
    // prefix has to fall back to the tab label - see #collectActiveCriteria.
    const counts = fieldNameCounts(tab({ name: 'table' }, { name: 'table' }, { name: 'updated' }));

    expect(counts.get('table')).toBeGreaterThan(1);
    expect(counts.get('updated')).toBe(1);
  });

  it('reports nothing for a tab without fields', () => {
    expect(fieldNameCounts({ configuration: {} }).size).toBe(0);
  });
});
