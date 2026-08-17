import { describe, expect, it } from 'vitest'
import {
  ZERO_PROFIT_INPUTS,
  addProfitInputs,
  availableProfit,
  businessEarnings,
  profitLoss,
  profitMargin,
  type ProfitInputs,
} from './profit'

// The month from the audit that produced three different answers on four
// screens: Tk 2,000,000 of purchases at 5% SP, Tk 300,000 gross profit,
// no other income, Tk 120,000 of expenses.
const august: ProfitInputs = {
  grossProfit: 300_000,
  purchaseIncentive: 100_000,
  otherIncome: 0,
  expenses: 120_000,
}

describe('the one profit definition', () => {
  it('counts the supplier incentive as earnings', () => {
    expect(businessEarnings(august)).toBe(400_000)
  })

  it('takes expenses off the earnings to get the bottom line', () => {
    expect(profitLoss(august)).toBe(280_000)
  })

  it('is the figure the two report pages already showed, not the other two', () => {
    // Report Summary and Monthly Report said 280,000. The Yearly Report's month
    // rows and the Dashboard said 180,000 because they dropped the incentive,
    // and the Yearly Report's own card said 400,000 because it added the
    // incentive but not the expenses. Only one of those can be right.
    expect(profitLoss(august)).toBe(280_000)
    expect(profitLoss(august)).not.toBe(180_000)
    expect(profitLoss(august)).not.toBe(400_000)
  })

  it('drops the incentive only when there is none', () => {
    const noIncentive = { ...august, purchaseIncentive: 0 }
    expect(profitLoss(noIncentive)).toBe(180_000)
  })

  it('adds other income alongside the incentive', () => {
    expect(profitLoss({ ...august, otherIncome: 50_000 })).toBe(330_000)
  })

  it('reports a loss as a negative rather than clamping it', () => {
    expect(profitLoss({ ...august, expenses: 500_000 })).toBe(-100_000)
  })
})

describe('availableProfit', () => {
  it('is the bottom line less what has been drawn', () => {
    expect(availableProfit(august, 80_000)).toBe(200_000)
  })

  it('goes negative when more was drawn than the period made', () => {
    // Over-drawing is a real event. Clamping it at zero would hide the one thing
    // the owner needs to see on this line.
    expect(availableProfit(august, 400_000)).toBe(-120_000)
  })

  it('equals the bottom line when nothing was drawn', () => {
    expect(availableProfit(august, 0)).toBe(profitLoss(august))
  })
})

describe('profitMargin', () => {
  it('is the bottom line as a percentage of sales', () => {
    expect(profitMargin(august, 1_400_000)).toBeCloseTo(20, 10)
  })

  it('is zero rather than NaN or Infinity when there were no sales', () => {
    // Both used to reach the screen as "NaN%".
    expect(profitMargin(august, 0)).toBe(0)
    expect(Number.isFinite(profitMargin(august, 0))).toBe(true)
    expect(profitMargin(ZERO_PROFIT_INPUTS, 0)).toBe(0)
  })

  it('is negative for a loss', () => {
    expect(profitMargin({ ...august, expenses: 500_000 }, 1_000_000)).toBeCloseTo(-10, 10)
  })
})

describe('a year is the sum of its months', () => {
  const months: ProfitInputs[] = [
    { grossProfit: 100_000, purchaseIncentive: 10_000, otherIncome: 5_000, expenses: 40_000 },
    { grossProfit: 200_000, purchaseIncentive: 25_000, otherIncome: 0, expenses: 60_000 },
    { grossProfit: 50_000, purchaseIncentive: 0, otherIncome: 2_000, expenses: 90_000 },
  ]

  it('adds up to the same bottom line whether summed before or after', () => {
    // The Yearly page totals its month rows and then shows a margin on the
    // total. That only agrees with the rows if profitLoss is linear in its
    // inputs - which it is, and this pins it down.
    const year = months.reduce(addProfitInputs, ZERO_PROFIT_INPUTS)
    const sumOfMonths = months.reduce((total, month) => total + profitLoss(month), 0)
    expect(profitLoss(year)).toBe(sumOfMonths)
  })

  it('sums each term independently', () => {
    const year = months.reduce(addProfitInputs, ZERO_PROFIT_INPUTS)
    expect(year).toEqual({
      grossProfit: 350_000,
      purchaseIncentive: 35_000,
      otherIncome: 7_000,
      expenses: 190_000,
    })
  })

  it('leaves the zero value alone as an identity', () => {
    expect(addProfitInputs(ZERO_PROFIT_INPUTS, august)).toEqual(august)
    expect(profitLoss(ZERO_PROFIT_INPUTS)).toBe(0)
    expect(businessEarnings(ZERO_PROFIT_INPUTS)).toBe(0)
  })
})
