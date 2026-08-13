import { describe, it, expect } from 'vitest'
import { monthKey, purchaseProgressForMonth, targetCompletion } from './purchaseRollingTarget'

// Jan to Jun 2026, Tk 3,000,000 - six months, so Tk 500,000 a month to start.
const TARGET = {
  start_year: 2026, start_month: 1,
  end_year: 2026, end_month: 6,
  total_amount: 3_000_000,
}

describe('purchaseProgressForMonth', () => {
  it('opens the first month at the even split', () => {
    const result = purchaseProgressForMonth(TARGET, {}, 2026, 1)
    expect(result.inRange).toBe(true)
    expect(result.target).toBe(500_000)
    expect(result.achieved).toBe(0)
  })

  it('reports how much a month went over', () => {
    const result = purchaseProgressForMonth(TARGET, { '2026-01': 800_000 }, 2026, 1)
    expect(result.achieved).toBe(800_000)
    expect(result.extra).toBe(300_000)
    expect(result.shortfall).toBe(0)
  })

  it('pulls the next month down by what was bought over', () => {
    // 3,000,000 - 800,000 = 2,200,000 left across Feb..Jun = 440,000 each.
    const january = purchaseProgressForMonth(TARGET, { '2026-01': 800_000 }, 2026, 1)
    expect(january.nextMonthTarget).toBe(440_000)

    const february = purchaseProgressForMonth(TARGET, { '2026-01': 800_000 }, 2026, 2)
    expect(february.target).toBe(440_000)
  })

  it('pushes the next month up when a month falls short', () => {
    // Nothing bought in January: the whole 3,000,000 spreads over Feb..Jun.
    const february = purchaseProgressForMonth(TARGET, { '2026-01': 0 }, 2026, 2)
    expect(february.target).toBe(600_000)

    const january = purchaseProgressForMonth(TARGET, {}, 2026, 1)
    expect(january.shortfall).toBe(500_000)
  })

  it('never asks for a negative amount once the target is cleared', () => {
    // The whole target bought in month one, and then some.
    const bought = { '2026-01': 4_000_000 }
    expect(purchaseProgressForMonth(TARGET, bought, 2026, 1).nextMonthTarget).toBe(0)
    expect(purchaseProgressForMonth(TARGET, bought, 2026, 2).target).toBe(0)
    expect(purchaseProgressForMonth(TARGET, bought, 2026, 6).target).toBe(0)
  })

  it('leaves a finished month alone however much came after it', () => {
    // January was supposed to buy 500,000 and did. February buying wildly does
    // not rewrite what January was asked for.
    const bought = { '2026-01': 500_000, '2026-02': 2_000_000 }
    expect(purchaseProgressForMonth(TARGET, bought, 2026, 1).target).toBe(500_000)
    // February opened at (3,000,000 - 500,000) / 5 = 500,000 and blew past it.
    const february = purchaseProgressForMonth(TARGET, bought, 2026, 2)
    expect(february.target).toBe(500_000)
    expect(february.extra).toBe(1_500_000)
    // What is left for March onward: 3,000,000 - 2,500,000 = 500,000 over 4.
    expect(february.nextMonthTarget).toBe(125_000)
  })

  it('has no next month to reduce in the last month of the range', () => {
    const june = purchaseProgressForMonth(TARGET, { '2026-06': 900_000 }, 2026, 6)
    expect(june.monthsRemaining).toBe(1)
    expect(june.nextMonthTarget).toBe(0)
  })

  it('crosses a year end', () => {
    // Nov 2026 to Feb 2027 is four months, so 100,000 each to start.
    const yearEnd = { start_year: 2026, start_month: 11, end_year: 2027, end_month: 2, total_amount: 400_000 }
    expect(purchaseProgressForMonth(yearEnd, {}, 2026, 11).target).toBe(100_000)

    // November bought its 100,000, December bought nothing - so December's
    // share rolls into the two months left: 300,000 over Jan and Feb.
    expect(purchaseProgressForMonth(yearEnd, { '2026-11': 100_000 }, 2027, 1).target).toBe(150_000)

    // November overbought by 60,000, which comes off the three months after.
    expect(purchaseProgressForMonth(yearEnd, { '2026-11': 160_000 }, 2026, 12).target).toBe(80_000)
  })

  it('says so when the month is outside the range', () => {
    const before = purchaseProgressForMonth(TARGET, {}, 2025, 12)
    const after = purchaseProgressForMonth(TARGET, {}, 2026, 7)
    expect(before.inRange).toBe(false)
    expect(after.inRange).toBe(false)
    expect(after.target).toBe(0)
  })

  it('still reports what was bought outside the range, as a fact on its own', () => {
    const after = purchaseProgressForMonth(TARGET, { '2026-07': 50_000 }, 2026, 7)
    expect(after.inRange).toBe(false)
    expect(after.achieved).toBe(50_000)
  })

  it('treats a backwards range as no target rather than dividing by a negative', () => {
    const backwards = { start_year: 2026, start_month: 6, end_year: 2026, end_month: 1, total_amount: 3_000_000 }
    expect(purchaseProgressForMonth(backwards, {}, 2026, 3).inRange).toBe(false)
  })

  it('reads missing and junk amounts as nothing bought', () => {
    const result = purchaseProgressForMonth(TARGET, { '2026-01': NaN as never }, 2026, 1)
    expect(result.achieved).toBe(0)
    expect(result.target).toBe(500_000)
  })
})

describe('targetCompletion', () => {
  // A fixed "today" so "has the period ended" does not depend on the day the
  // test happens to run.
  const during = new Date('2026-03-15T12:00:00')
  const after = new Date('2026-09-15T12:00:00')

  it('adds up everything bought inside the range', () => {
    const result = targetCompletion(TARGET, { '2026-01': 500_000, '2026-02': 700_000 }, during)
    expect(result.achieved).toBe(1_200_000)
    expect(result.remaining).toBe(1_800_000)
    expect(result.percent).toBe(40)
  })

  it('ignores buying that happened outside the target period', () => {
    // August is past the Jan-Jun range - it belongs to no target here.
    const result = targetCompletion(TARGET, { '2026-01': 500_000, '2026-08': 900_000 }, after)
    expect(result.achieved).toBe(500_000)
    expect(result.percent).toBe(16.67)
  })

  it('says a target is finished only once its last month has passed', () => {
    expect(targetCompletion(TARGET, {}, during).finished).toBe(false)
    // June is the last month; still inside it in June.
    expect(targetCompletion(TARGET, {}, new Date('2026-06-30T12:00:00')).finished).toBe(false)
    expect(targetCompletion(TARGET, {}, new Date('2026-07-01T12:00:00')).finished).toBe(true)
  })

  it('reports a finished target that fell short, which is the point of it', () => {
    const result = targetCompletion(TARGET, { '2026-01': 400_000, '2026-02': 400_000, '2026-03': 400_000 }, after)
    expect(result.finished).toBe(true)
    expect(result.percent).toBe(40)
    expect(result.remaining).toBe(1_800_000)
  })

  it('goes past 100 when more was bought than the target asked for', () => {
    const result = targetCompletion(TARGET, { '2026-01': 4_500_000 }, after)
    expect(result.percent).toBe(150)
    // Nothing is still owed, and that does not become a negative.
    expect(result.remaining).toBe(0)
  })

  it('does not divide by a zero target', () => {
    const zero = { ...TARGET, total_amount: 0 }
    expect(targetCompletion(zero, { '2026-01': 100 }, during).percent).toBe(0)
  })

  it('treats a backwards range as nothing achieved rather than looping', () => {
    const backwards = { start_year: 2026, start_month: 6, end_year: 2026, end_month: 1, total_amount: 3_000_000 }
    expect(targetCompletion(backwards, { '2026-03': 500_000 }, during).achieved).toBe(0)
  })
})

describe('monthKey', () => {
  it('pads the month so keys sort and match', () => {
    expect(monthKey(2026, 1)).toBe('2026-01')
    expect(monthKey(2026, 12)).toBe('2026-12')
  })
})
