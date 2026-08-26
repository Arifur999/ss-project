import { beforeEach, describe, expect, it } from 'vitest'
import type { SupportTicket } from '../services/support.services'
import { awaitingReplyCount, markSeen, readSeen, unreadReplyCount } from './supportUnread'

// These tests run in node, which has no localStorage. A dozen lines of it is
// cheaper than pulling the whole suite into a browser environment for one file.
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size },
}

const ticket = (id: string, status: SupportTicket['status'], lastMessage: string): SupportTicket => ({
  id, owner_id: 'w1', opened_by: 'u1', subject: id, status,
  created_at: lastMessage, last_message_at: lastMessage,
  solved_at: null, solved_by: null, messages: [],
})

describe('what the platform is counting', () => {
  it('counts what is waiting on an answer', () => {
    expect(awaitingReplyCount([
      ticket('a', 'open', '2026-08-26T09:00:00Z'),
      ticket('b', 'answered', '2026-08-26T09:00:00Z'),
      ticket('c', 'solved', '2026-08-26T09:00:00Z'),
      ticket('d', 'open', '2026-08-26T09:00:00Z'),
    ])).toBe(2)
  })

  it('does not clear because somebody looked', () => {
    // The count has no reading state at all: it goes down when the ticket is
    // answered, which is the only thing that should take it off the list.
    const waiting = [ticket('a', 'open', '2026-08-26T09:00:00Z')]
    expect(awaitingReplyCount(waiting)).toBe(1)
    expect(awaitingReplyCount(waiting)).toBe(1)
  })

  it('is zero on an empty inbox', () => {
    expect(awaitingReplyCount([])).toBe(0)
  })
})

describe('what a customer is counting', () => {
  const replied = ticket('a', 'answered', '2026-08-26T10:00:00Z')
  const t = (iso: string) => new Date(iso).getTime()

  it('counts a reply they have not opened', () => {
    expect(unreadReplyCount([replied], {})).toBe(1)
  })

  it('stops counting once they have opened it', () => {
    expect(unreadReplyCount([replied], { a: t('2026-08-26T10:00:01Z') })).toBe(0)
  })

  it('counts again when support writes after that', () => {
    const seen = { a: t('2026-08-26T10:00:01Z') }
    const newer = { ...replied, last_message_at: '2026-08-26T11:00:00Z' }
    expect(unreadReplyCount([newer], seen)).toBe(1)
  })

  it('ignores a conversation waiting on the customer themselves', () => {
    // They wrote last; there is nothing to read.
    expect(unreadReplyCount([ticket('a', 'open', '2026-08-26T10:00:00Z')], {})).toBe(0)
  })

  it('ignores a solved one', () => {
    expect(unreadReplyCount([ticket('a', 'solved', '2026-08-26T10:00:00Z')], {})).toBe(0)
  })

  it('treats an unreadable date as unread rather than silently hiding it', () => {
    expect(unreadReplyCount([{ ...replied, last_message_at: 'not-a-date' }], {})).toBe(0)
  })
})

describe('remembering where somebody had read up to', () => {
  beforeEach(() => localStorage.clear())

  it('keeps a position per ticket', () => {
    markSeen('u1', 't1', 1000)
    markSeen('u1', 't2', 2000)
    expect(readSeen('u1')).toEqual({ t1: 1000, t2: 2000 })
  })

  it('keeps two people apart on a shared machine', () => {
    markSeen('u1', 't1', 1000)
    expect(readSeen('u2')).toEqual({})
  })

  it('answers empty for nobody signed in', () => {
    expect(readSeen(null)).toEqual({})
    expect(markSeen(null, 't1')).toEqual({})
  })

  it('survives storage holding nonsense', () => {
    localStorage.setItem('support_seen_v1:u1', 'not json')
    expect(readSeen('u1')).toEqual({})
  })
})
