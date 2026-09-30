import { describe, expect, it, beforeEach } from 'vitest'
import { NOTICE_WINDOW_MS, isForbidden, resetAccessNotices, shouldAnnounce } from './accessNotice'

beforeEach(() => resetAccessNotices())

describe('isForbidden', () => {
  it('is only the refusal, not every failure', () => {
    expect(isForbidden(403)).toBe(true)
    expect(isForbidden('403')).toBe(true)
    expect(isForbidden(500)).toBe(false)
    expect(isForbidden(404)).toBe(false)
    expect(isForbidden(undefined)).toBe(false)
  })

  it('leaves 401 alone', () => {
    // The http client's interceptor already handles an expired session by
    // refreshing or signing out. A toast on top of that is noise during a
    // routine token refresh.
    expect(isForbidden(401)).toBe(false)
  })
})

describe('shouldAnnounce', () => {
  it('speaks once and then stays quiet', () => {
    // One page open fires eight to sixteen reads. Without this a restricted user
    // would meet a wall of identical toasts.
    expect(shouldAnnounce('accounts', 1_000)).toBe(true)
    expect(shouldAnnounce('accounts', 1_100)).toBe(false)
    expect(shouldAnnounce('accounts', 1_000 + NOTICE_WINDOW_MS - 1)).toBe(false)
  })

  it('speaks again once the window has passed', () => {
    expect(shouldAnnounce('accounts', 1_000)).toBe(true)
    expect(shouldAnnounce('accounts', 1_000 + NOTICE_WINDOW_MS)).toBe(true)
  })

  it('counts each table separately', () => {
    expect(shouldAnnounce('accounts', 1_000)).toBe(true)
    expect(shouldAnnounce('sale_payments', 1_000)).toBe(true)
    expect(shouldAnnounce('accounts', 1_000)).toBe(false)
  })
})
