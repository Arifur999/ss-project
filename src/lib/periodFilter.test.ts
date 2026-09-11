import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { inPeriod, periodLabel, periodToRange, type Period } from './periodFilter'

// Eight list pages filter through these three functions, so "This Month" has
// to mean the same thing on all of them. The clock is frozen because half of
// these answers are relative to today, and a test that only passes in
// September is worse than no test.

const NOW = new Date('2026-09-09T14:30:00')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('inPeriod', () => {
  it('lets everything through on All Time, whatever the dates are', () => {
    expect(inPeriod('2019-01-01', 'all', '', '')).toBe(true)
    expect(inPeriod('2030-12-31', 'all', '2026-01-01', '2026-01-02')).toBe(true)
  })

  it('matches today by the day, not the timestamp', () => {
    // The same row can arrive as a plain date or as a full timestamp; only the
    // day part is being asked about either way.
    expect(inPeriod('2026-09-09', 'today', '', '')).toBe(true)
    expect(inPeriod('2026-09-09T23:59:00', 'today', '', '')).toBe(true)
    expect(inPeriod('2026-09-08', 'today', '', '')).toBe(false)
  })

  it('matches yesterday', () => {
    expect(inPeriod('2026-09-08', 'yesterday', '', '')).toBe(true)
    expect(inPeriod('2026-09-09', 'yesterday', '', '')).toBe(false)
    expect(inPeriod('2026-09-07', 'yesterday', '', '')).toBe(false)
  })

  it('runs the week from Saturday to today', () => {
    // NOW is Wednesday 09-Sep-2026, so this week started Saturday the 5th.
    expect(inPeriod('2026-09-05', 'week', '', '')).toBe(true)
    expect(inPeriod('2026-09-09', 'week', '', '')).toBe(true)
    // Friday the 4th belongs to the week that ended.
    expect(inPeriod('2026-09-04', 'week', '', '')).toBe(false)
    // And nothing dated after today, even though Friday is still to come.
    expect(inPeriod('2026-09-10', 'week', '', '')).toBe(false)
  })

  it('keeps this month and this year to the calendar, not a rolling window', () => {
    expect(inPeriod('2026-09-01', 'month', '', '')).toBe(true)
    expect(inPeriod('2026-08-31', 'month', '', '')).toBe(false)
    expect(inPeriod('2026-01-01', 'year', '', '')).toBe(true)
    expect(inPeriod('2025-12-31', 'year', '', '')).toBe(false)
  })

  it('treats a custom range as inclusive at both ends', () => {
    expect(inPeriod('2026-08-01', 'custom', '2026-08-01', '2026-08-31')).toBe(true)
    expect(inPeriod('2026-08-31', 'custom', '2026-08-01', '2026-08-31')).toBe(true)
    expect(inPeriod('2026-07-31', 'custom', '2026-08-01', '2026-08-31')).toBe(false)
  })

  it('leaves a custom range open-ended when only one bound is set', () => {
    expect(inPeriod('2019-01-01', 'custom', '', '2026-08-31')).toBe(true)
    expect(inPeriod('2030-01-01', 'custom', '2026-08-01', '')).toBe(true)
  })

  it('keeps a row with an unreadable date rather than silently dropping it', () => {
    // Hiding a transaction because its date could not be parsed is how money
    // goes missing from a total nobody is checking.
    expect(inPeriod('', 'month', '', '')).toBe(true)
    expect(inPeriod('not a date', 'today', '', '')).toBe(true)
  })
})

describe('periodToRange', () => {
  it('sends no bounds for All Time, so the server returns everything', () => {
    expect(periodToRange('all', '', '')).toEqual({})
  })

  it('sends one day for today and for yesterday', () => {
    expect(periodToRange('today', '', '')).toEqual({ from: '2026-09-09', to: '2026-09-09' })
    expect(periodToRange('yesterday', '', '')).toEqual({ from: '2026-09-08', to: '2026-09-08' })
  })

  it('sends Saturday through today for the week', () => {
    expect(periodToRange('week', '', '')).toEqual({ from: '2026-09-05', to: '2026-09-09' })
  })

  it('sends the whole calendar month and year', () => {
    expect(periodToRange('month', '', '')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(periodToRange('year', '', '')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('passes a custom range through, dropping a bound that was left empty', () => {
    expect(periodToRange('custom', '2026-08-01', '2026-08-31')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(periodToRange('custom', '', '2026-08-31')).toEqual({ from: undefined, to: '2026-08-31' })
  })

  it('agrees with inPeriod on what falls inside each choice', () => {
    // The two are used by different pages for the same question - one filters a
    // loaded list, the other asks the server - so they cannot disagree.
    for (const period of ['today', 'yesterday', 'week', 'month', 'year'] as Period[]) {
      const range = periodToRange(period, '', '')
      expect(inPeriod(range.from as string, period, '', '')).toBe(true)
      expect(inPeriod(range.to as string, period, '', '')).toBe(true)
    }
  })
})

describe('periodLabel', () => {
  it('names every choice for the printed header', () => {
    expect(periodLabel('all', '', '')).toBe('All Time')
    expect(periodLabel('today', '', '')).toBe('Today')
    expect(periodLabel('yesterday', '', '')).toBe('Yesterday')
    expect(periodLabel('week', '', '')).toBe('This Week')
    expect(periodLabel('month', '', '')).toBe('This Month')
    expect(periodLabel('year', '', '')).toBe('This Year')
    expect(periodLabel('custom', '2026-08-01', '2026-08-31')).toBe('2026-08-01 to 2026-08-31')
  })

  it('marks a missing bound rather than printing a blank', () => {
    expect(periodLabel('custom', '', '')).toBe('... to ...')
  })
})
