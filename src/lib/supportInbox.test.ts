import { describe, expect, it } from 'vitest'
import type { SupportTicket, SupportTicketStatus } from '../services/support.services'
import { askerName, awaitingCount, sortInbox, waitedFor } from './supportInbox'

const ticket = (id: string, status: SupportTicketStatus, lastMessage: string): SupportTicket => ({
  id, owner_id: 'w1', opened_by: 'u1', subject: id, status,
  created_at: lastMessage, last_message_at: lastMessage,
  solved_at: null, solved_by: null, messages: [],
})

describe('the order the inbox is worked in', () => {
  it('puts what is waiting on us above what is not', () => {
    const rows = sortInbox([
      ticket('solved', 'solved', '2026-08-25T12:00:00Z'),
      ticket('answered', 'answered', '2026-08-25T12:00:00Z'),
      ticket('waiting', 'open', '2026-08-25T09:00:00Z'),
    ])
    expect(rows.map(r => r.id)).toEqual(['waiting', 'answered', 'solved'])
  })

  it('answers the person who has waited longest first', () => {
    // Newest-first is wrong for a queue: on a busy day the unanswered ticket
    // sinks under conversations already handled.
    const rows = sortInbox([
      ticket('an hour ago', 'open', '2026-08-25T11:00:00Z'),
      ticket('three days ago', 'open', '2026-08-22T11:00:00Z'),
      ticket('yesterday', 'open', '2026-08-24T11:00:00Z'),
    ])
    expect(rows.map(r => r.id)).toEqual(['three days ago', 'yesterday', 'an hour ago'])
  })

  it('reads settled tickets newest first, as a history', () => {
    const rows = sortInbox([
      ticket('older', 'solved', '2026-08-20T11:00:00Z'),
      ticket('newer', 'solved', '2026-08-24T11:00:00Z'),
    ])
    expect(rows.map(r => r.id)).toEqual(['newer', 'older'])
  })

  it('does not disturb the array it was handed', () => {
    const input = [ticket('b', 'solved', '2026-08-20T11:00:00Z'), ticket('a', 'open', '2026-08-24T11:00:00Z')]
    sortInbox(input)
    expect(input.map(r => r.id)).toEqual(['b', 'a'])
  })

  it('survives an unreadable date rather than scrambling the queue', () => {
    const rows = sortInbox([ticket('bad', 'open', 'not-a-date'), ticket('good', 'open', '2026-08-24T11:00:00Z')])
    expect(rows).toHaveLength(2)
  })
})

describe('what the badge counts', () => {
  it('counts only what is owed an answer', () => {
    expect(awaitingCount([
      ticket('a', 'open', '2026-08-25T11:00:00Z'),
      ticket('b', 'answered', '2026-08-25T11:00:00Z'),
      ticket('c', 'solved', '2026-08-25T11:00:00Z'),
      ticket('d', 'open', '2026-08-25T11:00:00Z'),
    ])).toBe(2)
  })

  it('is zero on an empty inbox', () => {
    expect(awaitingCount([])).toBe(0)
  })
})

describe('how long somebody has been waiting', () => {
  const now = new Date('2026-08-25T12:00:00Z')

  it('reads in minutes, hours and days as the wait grows', () => {
    expect(waitedFor('2026-08-25T11:45:00Z', now)).toBe('15 min')
    expect(waitedFor('2026-08-25T09:00:00Z', now)).toBe('3 hours')
    expect(waitedFor('2026-08-22T12:00:00Z', now)).toBe('3 days')
  })

  it('says an hour, not 1 hours', () => {
    expect(waitedFor('2026-08-25T11:00:00Z', now)).toBe('1 hour')
    expect(waitedFor('2026-08-24T12:00:00Z', now)).toBe('1 day')
  })

  it('handles the message that just arrived', () => {
    expect(waitedFor('2026-08-25T11:59:40Z', now)).toBe('just now')
  })

  it('shows a dash rather than NaN for an unreadable date', () => {
    expect(waitedFor('not-a-date', now)).toBe('-')
  })
})

describe('who is asking', () => {
  it('prefers their name', () => {
    expect(askerName({ ...ticket('a', 'open', '2026-08-25T11:00:00Z'), owner: { id: 'w1', full_name: 'Hm Khaled', email: 'k@x.com', phone: null } })).toBe('Hm Khaled')
  })

  it('falls back to the email when the name is blank', () => {
    expect(askerName({ ...ticket('a', 'open', '2026-08-25T11:00:00Z'), owner: { id: 'w1', full_name: '   ', email: 'k@x.com', phone: null } })).toBe('k@x.com')
  })

  it('never renders an empty cell', () => {
    expect(askerName(ticket('a', 'open', '2026-08-25T11:00:00Z'))).toBe('Unknown customer')
  })
})
