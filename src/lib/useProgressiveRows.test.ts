import { describe, it, expect } from 'vitest'

// The reset rule for progressive rendering, tested as the plain decision it
// is. The bug this pins down: keying the reset on the array itself meant a
// page that builds its filtered list inline - a new array on every render -
// reset the visible count on every render. Scrolling to eighty rows snapped
// straight back to forty, and the page thrashed between the two hard enough
// to make an open date picker unusable.

// Mirrors the effect's dependency check.
function shouldReset(previous: { length: number; initial: number }, next: { length: number; initial: number }) {
  return previous.length !== next.length || previous.initial !== next.initial
}

const visibleAfter = (rowCount: number, visibleCount: number) => Math.min(rowCount, visibleCount)

describe('when the visible count resets', () => {
  it('does not reset just because the array is a new object', () => {
    // Same rows, rebuilt by a re-render.
    expect(shouldReset({ length: 500, initial: 40 }, { length: 500, initial: 40 })).toBe(false)
  })

  it('resets when a filter changes the number of rows', () => {
    expect(shouldReset({ length: 500, initial: 40 }, { length: 12, initial: 40 })).toBe(true)
  })

  it('resets when the page size itself changes', () => {
    expect(shouldReset({ length: 500, initial: 40 }, { length: 500, initial: 100 })).toBe(true)
  })
})

describe('the slice that gets rendered', () => {
  it('grows by a step and stops at the end', () => {
    expect(visibleAfter(500, 40)).toBe(40)
    expect(visibleAfter(500, 80)).toBe(80)
    expect(visibleAfter(50, 80)).toBe(50)
  })

  it('shows everything when the list is shorter than one page', () => {
    expect(visibleAfter(7, 40)).toBe(7)
  })

  it('handles an empty list without going negative', () => {
    expect(visibleAfter(0, 40)).toBe(0)
  })
})

describe('hasMore', () => {
  const hasMore = (rowCount: number, visibleCount: number) => rowCount > visibleCount

  it('is true only while rows remain undrawn', () => {
    expect(hasMore(500, 40)).toBe(true)
    expect(hasMore(40, 40)).toBe(false)
    expect(hasMore(0, 40)).toBe(false)
  })
})
