import toast from 'react-hot-toast'

// ---------------------------------------------------------------------------
// Saying out loud that the server refused.
//
// The shim turns every rejection into `{ data: [], error }` (supabase.ts, the
// catch at the bottom of runQuery) and not one page reads `.error`. That was
// fine while almost nothing was gated; it is not fine now. A permission denial
// arrived as an empty table, so "you cannot see this" and "there is nothing
// here" looked identical - on the Sales page it showed up as an empty payment
// dropdown and nobody knew why for months.
//
// The tricky part is volume. One page open fires eight to sixteen reads, and a
// restricted user would meet a wall of identical toasts. So a denial is
// announced once per table per window, and a second read of the same table
// inside that window is counted and stays quiet.
// ---------------------------------------------------------------------------

/** Long enough to cover one page's fetches, short enough that revisiting says it again. */
export const NOTICE_WINDOW_MS = 15_000

const announced = new Map<string, number>()

/**
 * Whether this denial is the first of its kind recently.
 *
 * Pure and time-injected so the dedupe rule can be tested without waiting
 * fifteen seconds. Calling it RECORDS the announcement - it is not a
 * predicate you may ask twice.
 */
export function shouldAnnounce(key: string, now = Date.now(), windowMs = NOTICE_WINDOW_MS): boolean {
  const last = announced.get(key)
  if (last !== undefined && now - last < windowMs) return false
  announced.set(key, now)
  return true
}

/** Forget every announcement. For tests, and for sign-out. */
export function resetAccessNotices(): void {
  announced.clear()
}

/**
 * Whether a failed request was a refusal rather than a breakage.
 *
 * 401 is deliberately NOT included: the http client's interceptor already
 * handles an expired session by refreshing or signing out, and a toast on top
 * of that would be noise during a routine token refresh.
 */
export function isForbidden(code: unknown): boolean {
  return Number(code) === 403
}

/**
 * Announce a refusal to the person looking at the screen.
 *
 * The server's own message is preferred because `requirePermission` names what
 * is missing, which is the difference between the user asking the owner to tick
 * one box and reporting the app as broken.
 */
export function noticeForbidden(table: string, message?: string): void {
  if (!shouldAnnounce(table)) return
  toast.error(message || `You do not have access to ${table.replace(/_/g, ' ')}.`, {
    id: `forbidden:${table}`,
    duration: 5000,
  })
}
