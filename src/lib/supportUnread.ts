import type { SupportTicket } from '../services/support.services'

/**
 * What the number beside "Support" in the sidebar counts.
 *
 * The two sides need different answers, because they are asking different
 * questions:
 *
 *   The platform asks "is anything waiting on us?" - so it counts tickets in
 *   the open state and the count clears by *answering*, never by looking. A
 *   badge that vanished when somebody glanced at the page is exactly how a
 *   ticket gets forgotten.
 *
 *   A customer asks "has anyone got back to me?" - so it counts tickets where
 *   support has spoken since they last opened that conversation, and clears by
 *   reading. Leaving it lit until they replied would nag somebody who read the
 *   answer and had nothing to add.
 */

/** Waiting on the platform. Set by the server from who spoke last. */
export const awaitingReplyCount = (tickets: SupportTicket[]): number =>
  tickets.filter(t => t.status === 'open').length

export type SeenMap = Record<string, number>

const at = (value: string): number => {
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Conversations support has replied to since this reader last opened them.
 *
 * "answered" is the server saying the platform spoke last, so no message list
 * has to be walked - and a ticket the customer has since replied to is back to
 * open and stops counting on its own.
 */
export const unreadReplyCount = (tickets: SupportTicket[], seen: SeenMap): number =>
  tickets.filter(t => t.status === 'answered' && at(t.last_message_at) > (seen[t.id] || 0)).length

// ---- Where "last opened" is remembered -----------------------------------
//
// The browser, not the server. It is a per-person reading position, worth no
// column and no migration, and the worst a lost one costs is a badge that
// shows again on a machine somebody has not used before.

const KEY = 'support_seen_v1'

export function readSeen(userId: string | null | undefined): SeenMap {
  if (!userId) return {}
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // Corrupt or unavailable storage must not take the sidebar down with it.
    return {}
  }
}

export function markSeen(userId: string | null | undefined, ticketId: string, when: number = Date.now()): SeenMap {
  if (!userId || !ticketId) return {}
  const next = { ...readSeen(userId), [ticketId]: when }
  try {
    localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(next))
  } catch {
    // Private browsing, or a full quota. The badge is worth less than a crash.
  }
  return next
}
