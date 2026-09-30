import { paidOnPurchaseBills, purchaseItemDeposit } from './purchaseAmounts'
import { firstAmount, roundTaka } from './utils'

// ---------------------------------------------------------------------------
// A year of buying, month by month, for one supplier or all of them.
//
// This is the sheet the owner has kept by hand: what was ordered, what the
// supplier gave back as incentive, what is therefore owed, and what actually
// left the till.
//
// Pure on purpose - it takes rows that have already been fetched and returns
// rows, so the arithmetic can be tested without a page or a network. Three
// consumers read the result (the chart, the twelve rows, the total), and a
// single source is what stops them disagreeing about a month.
//
// YearlyReport.tsx:234-244 computes three of these four figures already and
// renders none of them. It is the intended second caller - but adopting this
// module there would move its Total Purchases, because its order value leads
// with net_amount where this one leads with the item lines, and through
// profitInputs that would move its Profit/Loss too. That is a change of its
// own, not a side effect of this one.
// ---------------------------------------------------------------------------

export interface SupplierPurchaseMonth {
  /** 1-12. The total row carries 0. */
  monthIndex: number
  /** What was ordered: the lines added up. */
  orderValue: number
  /** What the supplier gives back - purchase_items.sp_amount. */
  incentive: number
  /** What they are owed: order value less the incentive, per line. */
  actualDeposit: number
  /** What actually reached them this month, both channels. */
  depositPaid: number
}

export interface SupplierYearlyPurchase {
  /** Always exactly twelve, January first, zeros included. */
  months: SupplierPurchaseMonth[]
  total: SupplierPurchaseMonth
}

interface PurchaseLike {
  date?: unknown
  supplier_id?: unknown
  paid_amount?: unknown
  total_amount?: unknown
  net_amount?: unknown
  purchase_items?: { total_amount?: unknown; sp_amount?: unknown }[]
}

interface PaymentLike {
  date?: unknown
  supplier_id?: unknown
  amount?: unknown
}

/**
 * The year and month written in a stored date, read off the string.
 *
 * Not `new Date(value).getMonth()`. A date-only string parses as UTC midnight,
 * so anywhere west of UTC `new Date('2026-01-01')` is December 2025 - and the
 * whole point of this page is a row landing in the right month.
 */
export const yearOfDay = (date: unknown): number => Number(String(date || '').slice(0, 4)) || 0
export const monthOfDay = (date: unknown): number => Number(String(date || '').slice(5, 7)) || 0

/**
 * A bill's order value: its lines if it has them, its own total if not.
 *
 * Lines first so the row subtracts on screen. If this came off `net_amount`
 * while the deposit column came off the lines, "Order Value − Incentive" would
 * visibly fail to equal "Actual Deposit" - on a page whose whole purpose is
 * that the owner can check the arithmetic by hand.
 */
export const purchaseOrderValue = (purchase: PurchaseLike): number => {
  const lines = purchase.purchase_items || []
  if (lines.length > 0) {
    return lines.reduce((sum, item) => sum + roundTaka(item.total_amount), 0)
  }
  return roundTaka(firstAmount(purchase.net_amount, purchase.total_amount))
}

const emptyMonth = (monthIndex: number): SupplierPurchaseMonth => ({
  monthIndex, orderValue: 0, incentive: 0, actualDeposit: 0, depositPaid: 0,
})

/**
 * One year of buying, bucketed by month.
 *
 * `supplierId` empty means every supplier - the house "All Supplier" default.
 * Note that a row with no supplier_id at all (older payments) counts under
 * "all" and under no individual supplier, so the per-supplier views need not
 * add up to the all-suppliers one. That is what the filter means, not a bug to
 * be patched.
 *
 * The year is re-checked here rather than trusted from the query, because the
 * shim only ever WIDENS a server date range - so December of the previous year
 * can arrive in a response asked for January onward.
 */
export function supplierYearlyPurchase(input: {
  year: number
  supplierId?: string
  purchases: PurchaseLike[]
  payments: PaymentLike[]
}): SupplierYearlyPurchase {
  const months = Array.from({ length: 12 }, (_, index) => emptyMonth(index + 1))
  const wanted = String(input.supplierId || '')
  const mine = (supplierId: unknown) => !wanted || String(supplierId || '') === wanted

  const inMonth = (date: unknown) => {
    if (yearOfDay(date) !== input.year) return 0
    const month = monthOfDay(date)
    return month >= 1 && month <= 12 ? month : 0
  }

  for (const purchase of input.purchases) {
    if (!mine(purchase.supplier_id)) continue
    const month = inMonth(purchase.date)
    if (!month) continue
    const row = months[month - 1]

    const lines = purchase.purchase_items || []
    row.orderValue += purchaseOrderValue(purchase)
    row.incentive += lines.reduce((sum, item) => sum + roundTaka(item.sp_amount), 0)
    // A bill with no lines has no recorded incentive, so all of it is owed.
    row.actualDeposit += lines.length > 0
      ? lines.reduce((sum, item) => sum + purchaseItemDeposit(item), 0)
      : purchaseOrderValue(purchase)

    // Money handed over when the bill was entered. The other channel is below.
    row.depositPaid += paidOnPurchaseBills([purchase])
  }

  // The second channel: money sent afterwards, keyed to the day it left rather
  // than to the bill's own date. paidOnPurchaseBills documents that the two do
  // not overlap - creating a purchase writes paid_amount and no payment row -
  // so adding them is not double counting. A payment's purchase_id is a
  // reference to which bill it settles, never a copy of that bill's
  // paid_amount, and must not be netted off.
  for (const payment of input.payments) {
    if (!mine(payment.supplier_id)) continue
    const month = inMonth(payment.date)
    if (!month) continue
    months[month - 1].depositPaid += roundTaka(payment.amount)
  }

  const total = months.reduce((sum, row) => ({
    monthIndex: 0,
    orderValue: sum.orderValue + row.orderValue,
    incentive: sum.incentive + row.incentive,
    actualDeposit: sum.actualDeposit + row.actualDeposit,
    depositPaid: sum.depositPaid + row.depositPaid,
  }), emptyMonth(0))

  return { months, total }
}
