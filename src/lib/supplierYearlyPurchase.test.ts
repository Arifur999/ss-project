import { describe, it, expect } from 'vitest'
import { monthOfDay, purchaseOrderValue, supplierYearlyPurchase, yearOfDay } from './supplierYearlyPurchase'

const bill = (over: Record<string, unknown> = {}) => ({
  date: '2026-03-10',
  supplier_id: 'sup-a',
  paid_amount: 0,
  purchase_items: [{ total_amount: 10_000, sp_amount: 1_000 }],
  ...over,
})

const run = (over: Record<string, unknown> = {}) => supplierYearlyPurchase({
  year: 2026,
  purchases: [],
  payments: [],
  ...over,
} as never)

describe('supplierYearlyPurchase', () => {
  it('always returns twelve months, January first', () => {
    const report = run()
    expect(report.months).toHaveLength(12)
    expect(report.months[0].monthIndex).toBe(1)
    expect(report.months[11].monthIndex).toBe(12)
  })

  it('an empty year is twelve zero rows, not an empty table', () => {
    const report = run()
    expect(report.months.every(row => row.orderValue === 0 && row.depositPaid === 0)).toBe(true)
    expect(report.total.orderValue).toBe(0)
  })

  it('puts a bill in its own month, and the row subtracts', () => {
    const march = run({ purchases: [bill()] }).months[2]
    expect(march.orderValue).toBe(10_000)
    expect(march.incentive).toBe(1_000)
    expect(march.actualDeposit).toBe(9_000)
    expect(march.orderValue - march.incentive).toBe(march.actualDeposit)
  })

  // The expensive one. paid_amount is what was handed over when the bill was
  // entered; supplier_payments are what was sent afterwards. They do not
  // overlap, and dropping either makes every month read as arrears.
  it('counts both payment channels', () => {
    const report = run({
      purchases: [bill({ paid_amount: 4_000 })],
      payments: [{ date: '2026-03-20', supplier_id: 'sup-a', amount: 3_000 }],
    })
    expect(report.months[2].depositPaid).toBe(7_000)
    expect(report.total.depositPaid).toBe(7_000)
  })

  // The wobble the owner described: the two deposit columns are an accrual and
  // a cash movement, so a late payment belongs to a different month.
  it('buckets a later payment by the day it left, not by the bill', () => {
    const report = run({
      purchases: [bill({ date: '2026-03-03', paid_amount: 50_000, purchase_items: [{ total_amount: 80_000, sp_amount: 0 }] })],
      payments: [{ date: '2026-04-04', supplier_id: 'sup-a', amount: 30_000 }],
    })
    expect(report.months[2].depositPaid).toBe(50_000)
    expect(report.months[3].depositPaid).toBe(30_000)
    expect(report.months[2].actualDeposit).toBe(80_000)
    expect(report.months[3].actualDeposit).toBe(0)
  })

  // new Date('2026-01-01').getMonth() is December 2025 west of UTC.
  it('reads the month off the string, so the year does not wrap', () => {
    const report = run({
      purchases: [
        bill({ date: '2026-01-01' }),
        bill({ date: '2026-12-31' }),
      ],
    })
    expect(report.months[0].orderValue).toBe(10_000)
    expect(report.months[11].orderValue).toBe(10_000)
  })

  it('drops another year, however the query was widened', () => {
    const report = run({ purchases: [bill({ date: '2025-12-31' }), bill({ date: '2027-01-01' })] })
    expect(report.total.orderValue).toBe(0)
  })

  it('a supplier filter drops the other supplier bills and payments alike', () => {
    const input = {
      purchases: [bill({ supplier_id: 'sup-a' }), bill({ supplier_id: 'sup-b' })],
      payments: [
        { date: '2026-03-20', supplier_id: 'sup-a', amount: 1_000 },
        { date: '2026-03-20', supplier_id: 'sup-b', amount: 9_000 },
      ],
    }
    expect(run(input).total.orderValue).toBe(20_000)
    expect(run({ ...input, supplierId: 'sup-a' }).total.orderValue).toBe(10_000)
    expect(run({ ...input, supplierId: 'sup-a' }).total.depositPaid).toBe(1_000)
  })

  // Older rows carry no supplier at all. They belong to "all" and to nobody in
  // particular, so the per-supplier views need not add up to All.
  it('keeps a supplier-less row under All and under no one supplier', () => {
    const input = { purchases: [bill({ supplier_id: null })] }
    expect(run(input).total.orderValue).toBe(10_000)
    expect(run({ ...input, supplierId: 'sup-a' }).total.orderValue).toBe(0)
  })

  it('a bill with no lines is owed in full', () => {
    const march = run({ purchases: [bill({ purchase_items: [], net_amount: 7_500 })] }).months[2]
    expect(march.orderValue).toBe(7_500)
    expect(march.incentive).toBe(0)
    expect(march.actualDeposit).toBe(7_500)
  })

  // purchaseItemDeposit clamps at zero, the same basis the Supplier Dashboard
  // and the Purchase Ledger use. On such a line the row genuinely will not
  // subtract - asserted rather than hidden by switching to order - incentive.
  it('clamps a line whose incentive exceeds its value, and says so', () => {
    const march = run({ purchases: [bill({ purchase_items: [{ total_amount: 1_000, sp_amount: 1_500 }] })] }).months[2]
    expect(march.actualDeposit).toBe(0)
    expect(march.orderValue - march.incentive).toBe(-500)
    expect(march.actualDeposit).not.toBe(march.orderValue - march.incentive)
  })

  it('totals every column across the twelve months', () => {
    const report = run({
      purchases: [bill({ date: '2026-02-01' }), bill({ date: '2026-08-01', paid_amount: 2_000 })],
      payments: [{ date: '2026-09-09', supplier_id: 'sup-a', amount: 500 }],
    })
    expect(report.total.orderValue).toBe(20_000)
    expect(report.total.incentive).toBe(2_000)
    expect(report.total.actualDeposit).toBe(18_000)
    expect(report.total.depositPaid).toBe(2_500)
    expect(report.total.monthIndex).toBe(0)
  })
})

describe('purchaseOrderValue', () => {
  it('adds the lines when there are lines', () => {
    expect(purchaseOrderValue({
      net_amount: 999,
      purchase_items: [{ total_amount: 1_200 }, { total_amount: 800 }],
    })).toBe(2_000)
  })

  it('falls back to the bill total only when there are none', () => {
    expect(purchaseOrderValue({ net_amount: 5_000, total_amount: 6_000, purchase_items: [] })).toBe(5_000)
    expect(purchaseOrderValue({ total_amount: 6_000 })).toBe(6_000)
  })
})

describe('yearOfDay / monthOfDay', () => {
  it('reads a stored date string without a Date object', () => {
    expect(yearOfDay('2026-07-15')).toBe(2026)
    expect(monthOfDay('2026-07-15')).toBe(7)
  })

  it('survives a timestamp and a missing value', () => {
    expect(monthOfDay('2026-07-15T00:00:00.000Z')).toBe(7)
    expect(yearOfDay(null)).toBe(0)
    expect(monthOfDay(undefined)).toBe(0)
  })
})
