import { describe, expect, it } from 'vitest';
import { findFilterMatches } from '@konradmichalik/pagetree-facets/Filter/filter-search.js';

const tabs = [
  {
    identifier: 'doktype',
    label: 'Page type',
    configuration: {
      fields: [
        {
          name: 'doktype',
          type: 'checkbox-group',
          options: [{ label: 'Standard' }, { label: 'Shortcut' }],
        },
      ],
    },
  },
  {
    identifier: 'state',
    label: 'State',
    configuration: {
      fields: [
        { name: 'is', type: 'checkbox-group', options: [{ label: 'Hidden' }] },
        { name: 'note', type: 'text' },
        { name: 'editor', type: 'user-picker' },
      ],
    },
  },
];

describe('findFilterMatches', () => {
  it('finds an option across every tab', () => {
    const matches = findFilterMatches(tabs, 'hidden');

    expect(matches).toHaveLength(1);
    expect(matches[0].tab.identifier).toBe('state');
    expect(matches[0].option.label).toBe('Hidden');
  });

  it('matches on a substring, case-insensitively', () => {
    expect(findFilterMatches(tabs, 'CUT').map((match) => match.option.label)).toEqual(['Shortcut']);
  });

  it('normalizes the query itself', () => {
    // The caller already trims and lowercases; owning it here as well keeps the
    // function usable with any casing instead of silently depending on that.
    expect(findFilterMatches(tabs, '  Standard  ')).toHaveLength(1);
  });

  it('returns every match, not just the first', () => {
    expect(findFilterMatches(tabs, 's')).toHaveLength(2);
  });

  it('skips fields that carry no option list', () => {
    // Text inputs and the user picker have nothing enumerable to match. Their
    // field label must not stand in for one, or searching "note" would offer a
    // criterion the results list cannot render.
    expect(findFilterMatches(tabs, 'note')).toEqual([]);
    expect(findFilterMatches(tabs, 'editor')).toEqual([]);
  });

  it('never matches on tab or field labels', () => {
    expect(findFilterMatches(tabs, 'Page type')).toEqual([]);
  });

  it('treats a blank query as no query', () => {
    // Guards the caller's own empty check: an empty needle would otherwise match
    // every option via includes('').
    expect(findFilterMatches(tabs, '')).toEqual([]);
    expect(findFilterMatches(tabs, '   ')).toEqual([]);
  });

  it('tolerates a tab without fields and a field without options', () => {
    const sparse = [{ configuration: {} }, { configuration: { fields: [{ name: 'x', type: 'select' }] } }];

    expect(findFilterMatches(sparse, 'anything')).toEqual([]);
  });
});
