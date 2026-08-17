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
