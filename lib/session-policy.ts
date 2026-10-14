/** Inactivity policy. Enforced server-side in proxy.ts and mirrored by the IdleSignOut watcher in the browser. */
export const IDLE_MS = 20 * 60 * 1000;
/** Show the "still there?" prompt this long before the timeout. */
export const WARN_MS = 60 * 1000;
/** httpOnly cookie holding the time (ms) of the last activity. Brand-neutral on purpose. */
export const ACTIVE_COOKIE = "qrf-active";
