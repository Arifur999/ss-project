import { describe, expect, it } from 'vitest'
import { LIVE_POLL_MS, TYPING_HEARTBEAT_MS, shouldPoll, shouldSendHeartbeat } from './livePoll'

describe('when a conversation polls', () => {
  it('polls while somebody is looking at it', () => {
    expect(shouldPoll('visible')).toBe(true)
  })

  it('stops when the tab is hidden', () => {
    // A hidden tab has nobody to show a bubble to, and whatever arrived is
    // fetched the moment it comes back.
    expect(shouldPoll('hidden')).toBe(false)
  })

  it('is brisk enough that a typing bubble still means something', () => {
    // A bubble that arrives after the message it was meant to precede is worse
    // than none at all.
    expect(LIVE_POLL_MS).toBeLessThanOrEqual(5000)
  })
})

describe('how often the client says it is still typing', () => {
  it('does not send one per keystroke', () => {
    expect(shouldSendHeartbeat(1000, 1000 + TYPING_HEARTBEAT_MS - 1)).toBe(false)
  })

  it('sends again once the gap has passed', () => {
    expect(shouldSendHeartbeat(1000, 1000 + TYPING_HEARTBEAT_MS)).toBe(true)
  })

  it('sends the very first one immediately', () => {
    expect(shouldSendHeartbeat(0, Date.now())).toBe(true)
  })

  it('beats faster than the server forgets, so the bubble never flickers', () => {
    // The server holds a typing mark for 6s (see typingRegistry).
    expect(TYPING_HEARTBEAT_MS).toBeLessThan(6000)
  })
})
