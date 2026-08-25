import { describe, expect, it } from 'vitest'
import { bubbleFor, bubbleIsMine } from './typingSide'

const CLEAR = 3500
const now = 10_000

describe('whose typing bubble to draw', () => {
  it('shows the customer to an admin', () => {
    expect(bubbleFor({ at: now, from: 'customer' }, true, CLEAR, now)).toBe('customer')
  })

  it('shows support to a customer', () => {
    expect(bubbleFor({ at: now, from: 'admin' }, false, CLEAR, now)).toBe('admin')
  })

  it('never shows you your own typing', () => {
    // The server publishes a keystroke to everyone entitled to see the ticket,
    // the writer included - so this has to be filtered here.
    expect(bubbleFor({ at: now, from: 'admin' }, true, CLEAR, now)).toBeNull()
    expect(bubbleFor({ at: now, from: 'customer' }, false, CLEAR, now)).toBeNull()
  })

  it('forgets a mark that has gone stale', () => {
    expect(bubbleFor({ at: now - CLEAR + 1, from: 'admin' }, false, CLEAR, now)).toBe('admin')
    expect(bubbleFor({ at: now - CLEAR, from: 'admin' }, false, CLEAR, now)).toBeNull()
  })

  it('draws nothing when nobody has typed', () => {
    expect(bubbleFor(undefined, true, CLEAR, now)).toBeNull()
  })
})

describe('which side of the thread it sits on', () => {
  it('puts it on the writer, not on a fixed side', () => {
    // An admin reading: the customer writes on the left, the admin on the right.
    expect(bubbleIsMine('customer', true)).toBe(false)
    expect(bubbleIsMine('admin', true)).toBe(true)
    // A customer reading: the mirror of that.
    expect(bubbleIsMine('admin', false)).toBe(false)
    expect(bubbleIsMine('customer', false)).toBe(true)
  })
})
