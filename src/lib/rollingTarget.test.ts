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
 * and, when the first reading of that came out wrong, the sentence that settled
 * it:
 *
 *   "aie maser r 10 din baki.. target ase 100000 / 10 diner.. jodi kno din besi
 *    sells hoy tahole SOV GULAR target kome jabe, jodi kom sells hoy tahole bere
 *    jabe."
 *
 * So every day that has not closed yet - today included - shows ONE shared
 * figure, and that figure moves up or down together as sales land. Ten days left
 * and 100,000 to go means ten bars of 10,000, not one bar of 10,000 and nine of
 * 11,111, and not a staircase climbing to 100,000 on the last day.
 *
 * This is the most sensitive arithmetic in the app and it had no tests at all.
 */

const AUG = { monthlyTarget: 500_000, year: 2026, month: 8 } // 31 days
const FLAT = 500_000 / 31 // 16,129.03

const run = (salesMap: Record<number, number>, completed: number, current = completed + 1) =>
  calculateRollingTargets({ ...AUG, dailySalesMap: salesMap, completedThroughDay: completed, inProgressDay: current })

const targetOn = (records: { day: number; openingTarget: number }[], day: number) =>
  records.find(r => r.day === day)!.openingTarget

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

describe('selling LESS than the target pushes every open day up, together', () => {
  it('rises across completed days when each sold under target', () => {
    const r = run({ 1: 5_000, 2: 5_000, 3: 5_000 }, 3)
    const days = [1, 2, 3].map(d => targetOn(r.dailyRecords, d))
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1])
  })

  it("the owner's own example: 10 days left and 100,000 to go is 10,000 on EVERY one of them", () => {
    // "aie maser r 10 din baki, target ase 100000 / 10 diner."
    // Day 21 closes with 400,000 sold, so 100,000 is left across days 22-31.
    const r = run({ 21: 400_000 }, 21)
    for (let day = 22; day <= 31; day++) {
      expect(targetOn(r.dailyRecords, day), `day ${day}`).toBeCloseTo(10_000, 1)
    }
  })

  it('today and every upcoming day carry the SAME figure', () => {
    // The bug: today divided by the days INCLUDING today, upcoming days divided
    // by the days AFTER today - so 100,000 over 10 days showed 10,000 today and
    // 11,111 for each of the other nine. One outstanding amount, two answers.
    const r = run({ 1: 20_000 }, 1, 2)
    const open = r.dailyRecords.filter(rec => rec.status !== 'completed')
    expect(open.length).toBe(30)
    expect(new Set(open.map(rec => rec.openingTarget)).size).toBe(1)
    expect(r.upcomingDailyTarget).toBeCloseTo(r.currentDailyTarget, 1)
  })

  it('a heavy day pulls every remaining day down at once', () => {
    const before = run({ 21: 400_000 }, 21)
    const after = run({ 21: 400_000, 22: 40_000 }, 22)
    const beforeEach = targetOn(before.dailyRecords, 25)
    const afterEach = targetOn(after.dailyRecords, 25)
    expect(afterEach).toBeLessThan(beforeEach)
    // 60,000 left over the nine days 23-31.
    expect(afterEach).toBeCloseTo(60_000 / 9, 1)
  })

  it('a quiet day pushes every remaining day up at once', () => {
    const after = run({ 21: 400_000, 22: 1_000 }, 22)
    // 99,000 left over the nine days 23-31.
    expect(targetOn(after.dailyRecords, 25)).toBeCloseTo(99_000 / 9, 1)
    expect(targetOn(after.dailyRecords, 31)).toBeCloseTo(99_000 / 9, 1)
  })

  it('the last day is not asked for the whole outstanding amount', () => {
    // It would be, if each future day divided by its own days-to-month-end.
    const r = run({ 1: 20_000 }, 1)
    expect(targetOn(r.dailyRecords, 31)).toBeLessThan(480_000)
    expect(targetOn(r.dailyRecords, 31)).toBeCloseTo(480_000 / 30, 1)
  })
})


