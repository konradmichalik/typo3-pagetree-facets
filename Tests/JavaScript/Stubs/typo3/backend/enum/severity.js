/**
 * Stand-in for @typo3/backend/enum/severity.js.
 *
 * The extension only ever forwards one of these constants to Modal.confirm(), so
 * the numeric values matter to no assertion here - they mirror core's enum purely
 * so a test reading `severity: 1` sees the same number production would pass.
 */
export const SeverityEnum = {
  notice: -2,
  info: -1,
  ok: 0,
  warning: 1,
  error: 2,
};
