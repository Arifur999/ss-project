import { describe, expect, it } from 'vitest'
import {
  actualDp,
  purchaseDeposit,
  purchaseDueForPeriod,
  purchaseItemDeposit,
  spAmountFor,
  supplierBalance,
  supplierOpeningBalance,
} from './purchaseAmounts'

describe('purchaseDeposit', () => {
  it('is the total less the incentive the supplier gives back', () => {
    expect(purchaseDeposit(100_000, 5_000)).toBe(95_000)
  })

  it('is the whole total when there is no incentive', () => {
    expect(purchaseDeposit(100_000, 0)).toBe(100_000)
  })

  it('never goes below zero', () => {
    // An incentive larger than the line total is data entry gone wrong, not a
    // supplier paying us to take the goods.
    expect(purchaseDeposit(1_000, 5_000)).toBe(0)
  })

  it('is whole taka', () => {
    expect(purchaseDeposit(1_050.4, 52.5)).toBe(997)
  })

  it('treats missing fields as zero rather than NaN', () => {
    expect(purchaseDeposit(null, null)).toBe(0)
    expect(purchaseDeposit(1_000, undefined)).toBe(1_000)
    expect(purchaseDeposit('1000', '50')).toBe(950)
  })

  it('reads a purchase_items row directly', () => {
    expect(purchaseItemDeposit({ total_amount: 100_000, sp_amount: 5_000 })).toBe(95_000)
    // No deposit_amount column exists, so an empty row is the normal case for
    // an order loaded back from the server - and it must not read as Tk 0.
    expect(purchaseItemDeposit({ total_amount: 100_000 })).toBe(100_000)
    expect(purchaseItemDeposit({})).toBe(0)
  })
})

describe('actualDp', () => {
  it('takes the discount percentage off the DP', () => {
    expect(actualDp(1_000, 10)).toBe(900)
    expect(actualDp(1_000, 0)).toBe(1_000)
  })

  it('rounds the unit price so the line total stays whole', () => {
    // 7% off Tk 1,050 is 976.50 - the paisa the operator kept seeing.
    expect(actualDp(1_050, 7)).toBe(977)
    // And the total is then exactly the unit price times the quantity.
    expect(actualDp(1_050, 7) * 4).toBe(3_908)
  })

  it('rounds an exact half UP despite floating point', () => {
    // The reason actualDp multiplies before it divides. Written the obvious way,
    // `1050 * (1 - 7/100)` is 976.4999999999999 in IEEE-754 and rounds DOWN to
    // 976, which breaks the rule that half a taka goes up.
    expect(1_050 * (1 - 7 / 100)).toBeLessThan(976.5)
    expect(actualDp(1_050, 7)).toBe(977)

    // A sweep for any percentage that lands the discount exactly on a half.
    for (const [dp, pct, expected] of [
      [1_050, 7, 977],
      [150, 7, 140],
      [1_500, 5.1, 1_424],
      [4_050, 21, 3_200],
    ] as const) {
      expect(actualDp(dp, pct)).toBe(expected)
    }
  })

  it('handles a full discount and a missing percentage', () => {
    expect(actualDp(1_000, 100)).toBe(0)
    expect(actualDp(1_000, null)).toBe(1_000)
    expect(actualDp(null, 10)).toBe(0)
  })
})

describe('supplierOpeningBalance', () => {
  it('reads "pawna" as money they owe us', () => {
    expect(supplierOpeningBalance({ opening_due: 5_000, due_type: 'pawna' })).toBe(5_000)
  })

  it('reads anything else as money we owe them', () => {
    expect(supplierOpeningBalance({ opening_due: 5_000, due_type: 'dena' })).toBe(-5_000)
    expect(supplierOpeningBalance({ opening_due: 5_000 })).toBe(-5_000)
  })

  it('ignores the stored sign, since due_type carries the direction', () => {
    expect(supplierOpeningBalance({ opening_due: -5_000, due_type: 'pawna' })).toBe(5_000)
    expect(supplierOpeningBalance({ opening_due: -5_000, due_type: 'dena' })).toBe(-5_000)
  })

  it('is zero with nothing stored, and never negative zero', () => {
    // -Math.abs(0) is -0, which toLocaleString renders as "-0".
    expect(supplierOpeningBalance({})).toBe(0)
    expect(Object.is(supplierOpeningBalance({}), -0)).toBe(false)
    expect(supplierOpeningBalance({ opening_due: 0, due_type: 'dena' }).toLocaleString('en-US')).toBe('0')
  })
})

describe('supplierBalance', () => {
  // The supplier from the audit: 100 units at Tk 1,000 with 5% SP, Tk 30,000
  // paid. The three screens said -65,000, -10,000 and 70,000.
  const items = [{ total_amount: 100_000, sp_amount: 5_000 }]
  const payments = [{ amount: 30_000 }]

  it('is opening plus paid less what is owed', () => {
    expect(supplierBalance({ supplier: {}, items, payments })).toBe(-65_000)
  })

  it('deducts the SP incentive, because the paperwork does', () => {
    // The Purchase Ledger prints Actual Deposit as total less SP. Without the
    // incentive this would be -70,000.
    const noIncentive = [{ total_amount: 100_000, sp_amount: 0 }]
    expect(supplierBalance({ supplier: {}, items: noIncentive, payments })).toBe(-70_000)
  })

  it('bills what was ordered, not what has been received', () => {
    // The Purchase Orders page used to bill received x actual_dp, which for 40
    // of 100 units received came to -10,000 - the figure on screen when the
    // owner decides how much to pay.
    expect(supplierBalance({ supplier: {}, items, payments })).not.toBe(-10_000)
  })

  it('carries the opening position', () => {
    expect(supplierBalance({ supplier: { opening_due: 20_000, due_type: 'pawna' }, items, payments })).toBe(-45_000)
    expect(supplierBalance({ supplier: { opening_due: 20_000, due_type: 'dena' }, items, payments })).toBe(-85_000)
  })

  it('is positive when we have overpaid', () => {
    expect(supplierBalance({ supplier: {}, items, payments: [{ amount: 120_000 }] })).toBe(25_000)
  })

  it('is zero for a supplier with no history', () => {
    expect(supplierBalance({ supplier: {}, items: [], payments: [] })).toBe(0)
  })

  it('sums many lines and many payments', () => {
    expect(supplierBalance({
      supplier: {},
      items: [
        { total_amount: 50_000, sp_amount: 2_500 },
        { total_amount: 30_000, sp_amount: 1_500 },
      ],
      payments: [{ amount: 10_000 }, { amount: 5_000 }],
    })).toBe(15_000 - 76_000)
  })
})

describe('purchaseDueForPeriod', () => {
  it('is what is owed on the lines, less what was paid', () => {
    expect(purchaseDueForPeriod([{ total_amount: 100_000, sp_amount: 5_000 }], 30_000)).toBe(65_000)
  })

  it('agrees in magnitude with supplierBalance when there is no opening due', () => {
    const items = [{ total_amount: 100_000, sp_amount: 5_000 }]
    const payments = [{ amount: 30_000 }]
    expect(purchaseDueForPeriod(items, 30_000)).toBe(-supplierBalance({ supplier: {}, items, payments }))
  })

  it('goes negative on an overpayment rather than clamping', () => {
    expect(purchaseDueForPeriod([{ total_amount: 10_000, sp_amount: 0 }], 15_000)).toBe(-5_000)
  })
})

describe('spAmountFor', () => {
  it('is the percentage of the line total', () => {
    expect(spAmountFor(100_000, 5)).toBe(5_000)
    expect(spAmountFor(1_050, 5)).toBe(53)
  })

  it('is zero without a percentage', () => {
    expect(spAmountFor(100_000, 0)).toBe(0)
    expect(spAmountFor(100_000, null)).toBe(0)
  })

  it('and the deposit it implies still adds back to the total', () => {
    // The identity the Purchase Orders footer depends on: SP + deposit = total.
    for (const total of [100_000, 1_050, 33_333, 7]) {
      for (const pct of [0, 5, 7.5, 100]) {
        const sp = spAmountFor(total, pct)
        expect(sp + purchaseDeposit(total, sp)).toBe(total)
      }
    }
  })
})
