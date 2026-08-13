import { describe, it, expect } from 'vitest'
import { monthsInRange, perMonthAmount } from '../pages/reports/PurchaseTarget'

// The month count is not stored - it is worked out from the range every time
// it is shown, and the per-month figure divides by it. An off-by-one here
// would quietly change the number the owner buys against all period.

describe('monthsInRange', () => {
  it('counts both ends, so one month is one', () => {
    expect(monthsInRange({ start_year: 2026, start_month: 1, end_year: 2026, end_month: 1 })).toBe(1)
  })

  it('counts a six-month range as six', () => {
    expect(monthsInRange({ start_year: 2026, start_month: 1, end_year: 2026, end_month: 6 })).toBe(6)
  })

  it('crosses a year end', () => {
    // Nov 2026 -> Feb 2027 is Nov, Dec, Jan, Feb.
    expect(monthsInRange({ start_year: 2026, start_month: 11, end_year: 2027, end_month: 2 })).toBe(4)
  })

  it('counts a whole year as twelve, not thirteen', () => {
    expect(monthsInRange({ start_year: 2026, start_month: 1, end_year: 2026, end_month: 12 })).toBe(12)
  })

  it('is zero when the range runs backwards, never negative', () => {
    // A negative would flip the sign of the per-month figure.
    expect(monthsInRange({ start_year: 2026, start_month: 6, end_year: 2026, end_month: 1 })).toBe(0)
  })

  it('reads string values from the API the same as numbers', () => {
    expect(monthsInRange({ start_year: '2026', start_month: '1', end_year: '2026', end_month: '6' } as never)).toBe(6)
  })
})

describe('perMonthAmount', () => {
  it('splits the total across the months', () => {
    expect(perMonthAmount(3_000_000, 6)).toBe(500_000)
  })

  it('does not divide by zero on a backwards range', () => {
    expect(perMonthAmount(3_000_000, 0)).toBe(0)
  })

  it('treats a missing total as zero rather than NaN', () => {
    expect(perMonthAmount(undefined as never, 6)).toBe(0)
  })
})
