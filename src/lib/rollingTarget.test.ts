import { describe, expect, it } from 'vitest'
import { calculateRollingTargets, getDaysInMonth } from './rollingTarget'

/**
 * The owner's daily target rule, in his own words:
 *
 *   "amr monthly target 500000 tk and aug 31 day.. 500000/31 = far day 16129 tk.
 *    ekhon kno din jodi 16129 tk theke besi sales hoy tahole upcoming day gular
 *    target kome jabe.. and jodi kno din sells 16129 tkr kom hoy tahole upcoming
 *    day gular target day bay day bere jabe."
 *
 * This is the most sensitive arithmetic in the app and it had no tests at all.
 * Each block below is one sentence of that rule.
 */

const AUG = { monthlyTarget: 500_000, year: 2026, month: 8 } // 31 days
const FLAT = 500_000 / 31 // 16,129.03

const run = (salesMap: Record<number, number>, completed: number, current = completed + 1) =>
  calculateRollingTargets({ ...AUG, dailySalesMap: salesMap, completedThroughDay: completed, inProgressDay: current })

const targetOn = (records: { day: number; openingTarget: number }[], day: number) =>
  records.find(r => r.day === day)!.openingTarget

const everyDay = (salesMap: Record<number, number>) =>
  Array.from({ length: 17 }, (_, i) => [i + 1, salesMap[i + 1] ?? 0])

describe('day one asks for the flat share', () => {
  it('500,000 over 31 days is 16,129', () => {
    expect(targetOn(run({}, 0, 1).dailyRecords, 1)).toBeCloseTo(FLAT, 1)
  })

  it('a 30-day month divides by 30', () => {
    const june = calculateRollingTargets({
      monthlyTarget: 500_000, year: 2026, month: 6,
      dailySalesMap: {}, completedThroughDay: 0, inProgressDay: 1,
    })
    expect(getDaysInMonth(2026, 6)).toBe(30)
    expect(targetOn(june.dailyRecords, 1)).toBeCloseTo(500_000 / 30, 1)
  })
})

describe('selling MORE than the target pulls the later days down', () => {
  const r = run({ 1: 50_000 }, 1)

  it('every following day drops below the flat share', () => {
    expect(targetOn(r.dailyRecords, 2)).toBeLessThan(FLAT)
    expect(targetOn(r.dailyRecords, 3)).toBeLessThan(FLAT)
    expect(targetOn(r.dailyRecords, 31)).toBeLessThan(FLAT * 31) // sanity: still finite
  })

  it('hitting the whole month in one day drops the rest to zero', () => {
    const done = run({ 1: 500_000 }, 1)
    expect(targetOn(done.dailyRecords, 2)).toBe(0)
    expect(targetOn(done.dailyRecords, 31)).toBe(0)
    expect(done.remainingTarget).toBe(0)
  })

  it('overshooting the month never produces a negative target', () => {
    const over = run({ 1: 900_000 }, 1)
    expect(over.remainingTarget).toBe(0)
    expect(over.dailyRecords.every(rec => rec.openingTarget >= 0)).toBe(true)
  })
})

describe('selling LESS than the target pushes the later days up, day by day', () => {
  it('rises across completed days when each sold under target', () => {
    const r = run(Object.fromEntries(everyDay({})) as Record<number, number>, 17)
    const days = [1, 2, 3, 16, 17].map(d => targetOn(r.dailyRecords, d))
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1])
  })

  it('keeps rising THROUGH the upcoming days - they are not all equal', () => {
    // The bug the owner caught: "krommanoy barse na, upcoming ... porer gula
    // soman". Every future day used to carry one flat figure, so the chart rose
    // across history and then went flat from tomorrow - two rules in one month.
    const r = run({ 1: 20_000 }, 1)
    const upcoming = r.dailyRecords.filter(rec => rec.status === 'upcoming')
    expect(upcoming.length).toBeGreaterThan(2)
    for (let i = 1; i < upcoming.length; i++) {
      expect(upcoming[i].openingTarget).toBeGreaterThan(upcoming[i - 1].openingTarget)
    }
  })

  it('applies the SAME formula to a future day as to a past one', () => {
    // remaining / (days from that day to month end), whichever side of today.
    const r = run({ 1: 20_000 }, 1)
    const remaining = 500_000 - 20_000
    expect(targetOn(r.dailyRecords, 20)).toBeCloseTo(remaining / (31 - 20 + 1), 1)
    expect(targetOn(r.dailyRecords, 31)).toBeCloseTo(remaining / 1, 1)
  })

  it('the last day carries the whole outstanding amount', () => {
    const r = run({ 1: 20_000 }, 1)
    expect(targetOn(r.dailyRecords, 31)).toBeCloseTo(480_000, 1)
  })
})

describe("today's own bar holds still", () => {
  it('does not move however much sells today', () => {
    const quiet = run({ 1: 20_000 }, 1, 2)
    const busy = calculateRollingTargets({
      ...AUG, dailySalesMap: { 1: 20_000, 2: 90_000 }, completedThroughDay: 1, inProgressDay: 2,
    })
    // Day 2 locks once it has sales, but its opening target is the same figure
    // it showed all morning.
    expect(targetOn(busy.dailyRecords, 2)).toBeCloseTo(targetOn(quiet.dailyRecords, 2), 1)
  })

  it('history never moves once a day is closed', () => {
    const a = run({ 1: 20_000 }, 1)
    const b = run({ 1: 20_000, 2: 5_000 }, 2)
    const c = run({ 1: 20_000, 2: 5_000, 3: 80_000 }, 3)
    expect(targetOn(b.dailyRecords, 1)).toBeCloseTo(targetOn(a.dailyRecords, 1), 1)
    expect(targetOn(c.dailyRecords, 1)).toBeCloseTo(targetOn(a.dailyRecords, 1), 1)
    expect(targetOn(c.dailyRecords, 2)).toBeCloseTo(targetOn(b.dailyRecords, 2), 1)
  })
})

describe('the shape of the month', () => {
  it('emits one record for every calendar day, exactly once', () => {
    const r = run({ 1: 20_000 }, 1)
    expect(r.dailyRecords).toHaveLength(31)
    expect(new Set(r.dailyRecords.map(rec => rec.day)).size).toBe(31)
  })

  it('a past month has no current day and every day closed', () => {
    const r = calculateRollingTargets({
      ...AUG, dailySalesMap: { 1: 10_000 }, completedThroughDay: 31, inProgressDay: 0,
    })
    expect(r.inProgressDay).toBe(0)
    expect(r.dailyRecords.every(rec => rec.status === 'completed')).toBe(true)
  })

  it('survives a missing target without dividing by anything odd', () => {
    const r = calculateRollingTargets({
      monthlyTarget: 0, year: 2026, month: 8,
      dailySalesMap: {}, completedThroughDay: 17, inProgressDay: 18,
    })
    expect(r.dailyRecords.every(rec => rec.openingTarget === 0)).toBe(true)
    expect(r.dailyRecords.every(rec => Number.isFinite(rec.openingTarget))).toBe(true)
  })

  it('treats rubbish input as zero rather than NaN', () => {
    const r = calculateRollingTargets({
      monthlyTarget: Number.NaN, year: 2026, month: 8,
      dailySalesMap: { 1: Number.NaN, 2: -500 },
      completedThroughDay: 2, inProgressDay: 3,
    })
    expect(r.dailyRecords.every(rec => Number.isFinite(rec.openingTarget))).toBe(true)
    expect(r.totalSales).toBe(0)
  })
})
