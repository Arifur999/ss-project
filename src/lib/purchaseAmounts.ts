import { roundTaka } from './utils'

/**
 * What a purchase line is actually worth, in one place.
 *
 * There is no `deposit_amount` column - not in the Prisma schema, not in the
 * create payload, not in the validation schema. The Purchase Orders page carried
 * an editable Deposit input anyway, so the operator could type a figure, save,
 * and watch it come back as Tk 0 on every reopened order. Meanwhile Purchase
 * History and the Monthly Report both quietly derived the same figure and showed
 * the right number, so the three screens disagreed about every order.
 *
 * The deposit is not an independent figure to store: it is what is left to pay
 * the supplier after the incentive they give back, so it is derived here and the
 * Purchase Orders cell is read-only like the SP cell beside it.
 */

/** total less the SP incentive: what the supplier is actually owed on this line. */
export function purchaseDeposit(totalAmount: unknown, spAmount: unknown): number {
  return Math.max(0, roundTaka(totalAmount) - roundTaka(spAmount))
}

/** The same, read straight off a purchase_items row from the API. */
export function purchaseItemDeposit(item: { total_amount?: unknown; sp_amount?: unknown }): number {
  return purchaseDeposit(item.total_amount, item.sp_amount)
}

/**
 * The unit price after the DP discount.
 *
 * Rounded before it is multiplied by the quantity, so a line total is always the
 * whole-taka unit price times the quantity - arithmetic the operator can redo on
 * paper. 7% off Tk 1,050 is 976.50, which is where the paisa came from.
 *
 * Written as `dp - (dp * pct) / 100` rather than `dp * (1 - pct / 100)`, and the
 * difference is not cosmetic. In IEEE-754, `1 - 7/100` is 0.9299999999999999, so
 * the second form gives 976.4999999999999 for that example and rounds DOWN to
 * 976 - breaking the rule that half a taka rounds up. Multiplying first keeps
 * the figure exact: 1050 * 7 is an integer, /100 is exactly 73.5, and
 * 1050 - 73.5 is exactly 976.5, which rounds to 977.
 */
export function actualDp(dpPrice: unknown, discountPct: unknown): number {
  const dp = roundTaka(dpPrice)
  const pct = Number(discountPct) || 0
  return roundTaka(dp - (dp * pct) / 100)
}

/** The SP incentive on a line, from the percentage the order was placed at. */
export function spAmountFor(totalAmount: unknown, spPct: unknown): number {
  const total = roundTaka(totalAmount)
  const pct = Number(spPct) || 0
  return roundTaka((total * pct) / 100)
}

/**
 * A supplier's opening position, signed.
 *
 * `opening_due` is stored as a magnitude with `due_type` carrying the direction:
 * "pawna" is money they owe us (positive), anything else is money we owe them
 * (negative).
 */
export function supplierOpeningBalance(supplier: { opening_due?: unknown; due_type?: unknown }): number {
  const magnitude = Math.abs(roundTaka(supplier.opening_due))
  // `|| 0` on the negative branch, because -Math.abs(0) is -0 and a supplier
  // with no opening due would have rendered as "-0".
  return supplier.due_type === 'pawna' ? magnitude : -magnitude || 0
}

/**
 * What a supplier's account stands at. Negative means we owe them.
 *
 * There were three answers to this, and for one supplier - opening 0, an order
 * of 100 units at Tk 1,000 with 5% SP, 40 units received, Tk 30,000 paid - they
 * came out at -65,000, -10,000 and 70,000:
 *
 *   Supplier Dashboard    opening + payments - (ordered - SP)
 *   Purchase Orders       opening + payments - (received x actual_dp), no SP
 *   Monthly / Summary     net_amount - payments, no SP and no opening
 *
 * The Purchase Orders figure is the one on screen at the moment the owner
 * decides how much to pay a supplier, so it mattered most that it was the odd
 * one out.
 *
 * This is the ordered basis with the incentive deducted, because that is what
 * the app's own paperwork already says: the Purchase Ledger prints "Actual
 * Deposit" as total less SP and its Grand Total as previous due plus that. So a
 * supplier's balance is their opening position, plus what we have paid, less the
 * deposit owed on every line ordered - `purchaseDeposit`, the same term the
 * Deposit column shows.
 */
export function supplierBalance(input: {
  supplier: { opening_due?: unknown; due_type?: unknown }
  /** Every purchase_items row belonging to this supplier. */
  items: { total_amount?: unknown; sp_amount?: unknown }[]
  /** Every supplier_payments row belonging to this supplier. */
  payments: { amount?: unknown }[]
  /**
   * Every purchase belonging to this supplier, for the amount settled on the
   * bill itself.
   *
   * Money reaches a supplier two ways and they do not overlap: paid_amount is
   * what was handed over when the bill was entered, and supplier_payments are
   * what was sent afterwards. Creating a purchase writes paid_amount and no
   * payment row, so counting only the rows misses the rest.
   *
   * Left out, the Supplier Dashboard read the whole of it as still owing. On a
   * year of trading that was Tk 8.7 crore against a real Tk 1.3 crore, and one
   * bill with nothing paid on it and a payment recorded since still showed its
   * full amount outstanding.
   */
  purchases?: { paid_amount?: unknown }[]
}): number {
  const opening = supplierOpeningBalance(input.supplier)
  const paidLater = input.payments.reduce((sum, payment) => sum + roundTaka(payment.amount), 0)
  const paidOnBill = (input.purchases || []).reduce((sum, purchase) => sum + roundTaka(purchase.paid_amount), 0)
  const owed = input.items.reduce((sum, item) => sum + purchaseItemDeposit(item), 0)
  return opening + paidLater + paidOnBill - owed
}

/**
 * What is still owed on a set of purchases, for the report tables.
 *
 * The same deposit basis as supplierBalance, minus payments - so the Due column
 * on a report and the balance on the Supplier Dashboard describe the same debt.
 * It excludes the opening position, because a report covers a date range and the
 * opening due belongs to no month in it.
 */
export function purchaseDueForPeriod(
  items: { total_amount?: unknown; sp_amount?: unknown }[],
  paidAmount: unknown
): number {
  const owed = items.reduce((sum, item) => sum + purchaseItemDeposit(item), 0)
  return owed - roundTaka(paidAmount)
}
