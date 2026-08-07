/**
 * Page titles created by `pagetree-facets:seed-demo-content`
 * (Tests/Functional/Fixtures/Extensions/demo_content). All sit directly under
 * "Home" (uid 1). Kept as named constants so a rename in the seed command is
 * one edit here rather than a silently wrong string literal in every spec -
 * there is no `tsconfig.json`/`tsc` step in this project, so nothing here
 * would actually fail to compile; a drift would only surface as a failing
 * assertion at runtime.
 */
export const DEMO_PAGES = {
  home: 'Home',
  /** doktype 1, abstract + description, localized to German. */
  about: 'About us',
  /** doktype 1, no_index. */
  products: 'Products',
  /** doktype 1, hidden, timestamps backdated 400 days. */
  archive: 'Archive',
  /** doktype 1, fe_group + editlock + no_follow, backdated. */
  legal: 'Legal',
  /** doktype 1, starttime 30 days out. */
  comingSoon: 'Coming Soon',
  /** doktype 3 - external link. The only doktype-3 page, which makes it a clean single-match target. */
  externalLink: 'Partner Website',
  /** doktype 4 - shortcut to Home. */
  shortcut: 'Old Homepage',
  /** doktype 254 - sysfolder. */
  sysFolder: 'Assets',
  /** doktype 1, plain. */
  contact: 'Contact',
} as const;

/** A token matching no page at all - 99 is not a configured doktype. */
export const NO_MATCH_TOKEN = 'doktype:99';
