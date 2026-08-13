/**
 * Rolling purchase target — the same rule as the daily sales engine in
 * rollingTarget.ts, one level up: months instead of days.
 *
 * A purchase target is one supplier, a range of months, and a total. Each
 * month inside that range falls into one of two cases:
 *
 * 1. A month that has passed — the target it opened with is locked. What was
 *    bought that month does not change what that month was supposed to buy,
 *    only what is left for the months after it. History never moves.
 *
 * 2. Every month after — whatever is still owed, split evenly:
 *
 *        (total − everything bought so far) ÷ (months left, this one included)
 *
 *    So buying more than a month's target pulls the following months down, and
 *    buying less pushes them up. Clearing the whole target early leaves the
 *    rest at zero rather than going negative - you cannot owe a supplier a
 *    negative amount of buying.
 *
 * The calculation always starts from the total and the raw monthly purchases.
 * No previously shown target is ever fed back in, so the function is pure and
 * every month recomputes correctly after any purchase is added or removed.
 */

export interface PurchaseTargetRange {
  start_year: number
  start_month: number
  end_year: number
  end_month: number
  total_amount: number
}

export interface MonthProgress {
  /** False when the month asked about is outside the target's range. */
  inRange: boolean
  /** What this month was supposed to buy - locked once the month opens. */
  target: number
  /** What was actually bought from this supplier this month. */
  achieved: number
  /** How much over target, or 0. This is the extra column. */
  extra: number
  /** How much under target, or 0. */
  shortfall: number
  /** What the month after this one becomes, given what has been bought. */
  nextMonthTarget: number
  /** Months from the asked-about month to the end, inclusive. */
  monthsRemaining: number
  /** Still owed across the whole range after this month. */
  remainingAfter: number
}

const EMPTY: MonthProgress = {
  inRange: false,
  target: 0,
  achieved: 0,
  extra: 0,
  shortfall: 0,
  nextMonthTarget: 0,
  monthsRemaining: 0,
  remainingAfter: 0,
}

/** A month as a single comparable number, so ranges are plain arithmetic. */
export function monthIndex(year: number, month: number): number {
  return Number(year) * 12 + Number(month)
}

/** The key a monthly purchase map is expected to use: "2026-08". */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function money(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function round(value: number): number {
  return Number(value.toFixed(2))
}

/**
 * Where one supplier stands in one month of its purchase target.
 *
 * `purchasesByMonth` is keyed "YYYY-MM" and only needs to cover the target's
 * range; months missing from it count as nothing bought.
 */
export function purchaseProgressForMonth(
  target: PurchaseTargetRange,
  purchasesByMonth: Record<string, number>,
  year: number,
  month: number,
): MonthProgress {
  const start = monthIndex(target.start_year, target.start_month)
  const end = monthIndex(target.end_year, target.end_month)
  const asked = monthIndex(year, month)

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return EMPTY
  if (asked < start || asked > end) return { ...EMPTY, achieved: money(purchasesByMonth[monthKey(year, month)]) }

  let remaining = money(target.total_amount)
  let openingTarget = 0

  // Walk from the first month of the range to the one asked about. Each month
  // opens with what is left spread over the months from it to the end, then
  // hands on whatever it did not use.
  for (let cursor = start; cursor <= asked; cursor += 1) {
    const monthsLeft = end - cursor + 1
    openingTarget = monthsLeft > 0 ? remaining / monthsLeft : 0

    const cursorYear = Math.floor((cursor - 1) / 12)
    const cursorMonth = cursor - cursorYear * 12
    const bought = money(purchasesByMonth[monthKey(cursorYear, cursorMonth)])

    // The month asked about keeps its opening target; only the months after it
    // feel what was bought, which is what "next month goes down" means.
    if (cursor < asked) remaining = Math.max(0, remaining - bought)
  }

  const achieved = money(purchasesByMonth[monthKey(year, month)])
  const remainingAfter = Math.max(0, remaining - achieved)
  const monthsAfter = end - asked
  const nextMonthTarget = monthsAfter > 0 ? remainingAfter / monthsAfter : 0

  return {
    inRange: true,
    target: round(openingTarget),
    achieved: round(achieved),
    extra: round(Math.max(0, achieved - openingTarget)),
    shortfall: round(Math.max(0, openingTarget - achieved)),
    nextMonthTarget: round(nextMonthTarget),
    monthsRemaining: end - asked + 1,
    remainingAfter: round(remainingAfter),
  }
}
