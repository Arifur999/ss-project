import type { SupportTicket, SupportTicketStatus } from '../services/support.services'

/**
 * How the platform's inbox is ordered.
 *
 * Newest-first is wrong for a queue: the ticket nobody has answered is the one
 * that matters, and on a busy day it sinks under conversations already handled.
 * So tickets waiting on us come first, oldest wait at the top - answer the
 * person who has been waiting longest - and everything settled sorts newest
 * first, because that is a history, not a queue.
 */
const RANK: Record<SupportTicketStatus, number> = { open: 0, answered: 1, solved: 2 }

const time = (value: string) => {
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

export function sortInbox(tickets: SupportTicket[]): SupportTicket[] {
  return [...tickets].sort((a, b) => {
    const rank = RANK[a.status] - RANK[b.status]
    if (rank !== 0) return rank
    // Waiting on us: longest wait first. Otherwise: most recent first.
    return a.status === 'open'
      ? time(a.last_message_at) - time(b.last_message_at)
      : time(b.last_message_at) - time(a.last_message_at)
  })
}

/** How many are still owed an answer - the number worth putting on a badge. */
export const awaitingCount = (tickets: SupportTicket[]): number =>
  tickets.filter(t => t.status === 'open').length

/**
 * How long a ticket has been waiting, in words. Exact timestamps answer "when";
 * a queue is read for "how long", and "3 days" is the thing that prompts action.
 */
export function waitedFor(since: string, now: Date = new Date()): string {
  const started = time(since)
  if (!started) return '-'
  const minutes = Math.floor((now.getTime() - started) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

/** The customer's name for a ticket, however little of it was filled in. */
export const askerName = (ticket: SupportTicket): string =>
  ticket.owner?.full_name?.trim() || ticket.owner?.email || 'Unknown customer'

export const statusLabel: Record<SupportTicketStatus, string> = {
  open: 'Waiting for reply',
  answered: 'Answered',
  solved: 'Solved',
}

export const statusClass: Record<SupportTicketStatus, string> = {
  open: 'badge-orange',
  answered: 'badge-blue',
  solved: 'badge-green',
}
