/**
 * What "profit" means in this business - in one place, for every screen.
 *
 * There used to be four answers. For a month with Tk 300,000 gross profit,
 * Tk 100,000 of supplier incentive, no other income and Tk 120,000 of expenses:
 *
 *   Report Summary   Tk 280,000   gross + incentive + other - expenses
 *   Monthly Report   Tk 280,000   same
 *   Yearly Report    Tk 180,000   left the incentive out of every month row
 *   Dashboard        Tk 180,000   never even fetched the incentive
 *   Yearly's own "Profit Achieved" card   Tk 400,000   added the incentive but
 *                                                      not the expenses
 *
 * Three different figures for the same month, Tk 220,000 apart, and the Yearly
 * page disagreed with itself between a card and the column two rows below it.
 *
 * The definition the owner uses is the one the two report pages already had:
 * the supplier incentive (the SP percentage given back on purchases) is
 * earnings, so it belongs with the sales profit and the other income, and
 * expenses come off the total. Every screen now calls these functions rather
 * than re-deriving it, which is what stops the four from drifting again.
 */

/** The four figures every profit calculation in the app is built from. */
export interface ProfitInputs {
  /** Sales revenue less what the goods cost (FIFO), across the period. */
  grossProfit: number
  /** The SP incentive suppliers give back on purchases, across the period. */
  purchaseIncentive: number
  /** Income that is not a sale - rent, scrap, supplier rebates entered by hand. */
  otherIncome: number
  /** Everything paid out as an expense across the period. */
  expenses: number
}

/**
 * Everything the business earned, before expenses.
 *
 * All three terms land in the same pocket, which is why they are added: a
 * Tk 100,000 incentive cheque from a supplier spends the same as Tk 100,000 of
 * margin on a sofa.
 */
export function businessEarnings({ grossProfit, purchaseIncentive, otherIncome }: ProfitInputs): number {
  return grossProfit + purchaseIncentive + otherIncome
}

/** The bottom line: everything earned, less everything spent. */
export function profitLoss(inputs: ProfitInputs): number {
  return businessEarnings(inputs) - inputs.expenses
}

/**
 * What is left to draw on: the bottom line less what has already been taken out.
 *
 * Not clamped at zero - withdrawing more than the period made is a real thing
 * that happens, and hiding it behind a zero would be the more expensive lie.
 */
export function availableProfit(inputs: ProfitInputs, profitWithdraw: number): number {
  return profitLoss(inputs) - profitWithdraw
}

/**
 * Profit as a percentage of sales. Zero sales gives zero rather than NaN or
 * Infinity, both of which used to reach the screen as "NaN%".
 */
export function profitMargin(inputs: ProfitInputs, actualSales: number): number {
  if (!actualSales) return 0
  return (profitLoss(inputs) / actualSales) * 100
}

/** Adding up per-month rows into a year, term by term. */
export function addProfitInputs(a: ProfitInputs, b: ProfitInputs): ProfitInputs {
  return {
    grossProfit: a.grossProfit + b.grossProfit,
    purchaseIncentive: a.purchaseIncentive + b.purchaseIncentive,
    otherIncome: a.otherIncome + b.otherIncome,
    expenses: a.expenses + b.expenses,
  }
}

export const ZERO_PROFIT_INPUTS: ProfitInputs = {
  grossProfit: 0,
  purchaseIncentive: 0,
  otherIncome: 0,
  expenses: 0,
}
