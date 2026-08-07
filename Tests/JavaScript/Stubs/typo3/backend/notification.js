/**
 * Stand-in for @typo3/backend/notification.js.
 *
 * Records the two calls the extension makes (`success`, `error`) instead of
 * rendering anything - what matters to a test is which one was reached and with
 * what text, never how core displays it.
 */
const notifications = [];

/** Every notification since the last reset: `{severity, title, message}`, in order. */
export function shownNotifications() {
  return notifications;
}

export function resetNotificationStub() {
  notifications.length = 0;
}

export default {
  success(title, message) {
    notifications.push({ severity: 'success', title, message });
  },
  error(title, message) {
    notifications.push({ severity: 'error', title, message });
  },
};
