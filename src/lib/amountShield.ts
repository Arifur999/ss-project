import { useState } from 'react'

/**
 * Keeping the money off the screen until somebody asks for it.
 *
 * The Dashboard and the Balance Dashboard put the whole company on one screen -
 * net profit, every account's balance, what each customer still owes. That is a
 * page to be careful with when a customer is leaning over the counter or a
 * laptop is open in a shared office, and it was the first thing either page
 * showed.
 *
 * So figures are hidden by default and revealed by an eye, the same control the
 * Sales Ledger already uses for its purchase and profit columns.
 */

/** What a hidden figure reads as. The Sales Ledger's own columns use the same. */
export const HIDDEN_AMOUNT = '****'

/**
 * Hide or show, and the formatter to route every figure through.
 *
 * `formatCurr` comes back either as the real one or as a function that ignores
 * its argument - so a page applies this ONCE, where it reads formatCurr out of
 * useLang, instead of wrapping two dozen call sites. A figure added to the page
 * later is then covered by construction rather than leaking until somebody
 * notices it.
 *
 * Deliberately not remembered between visits. "Shown" persisted would mean
 * opening the laptop tomorrow to the same exposed screen, which is the thing
 * being avoided; re-hiding on every load is the safe direction to fail.
 */
export function useAmountShield(realFormatCurr: (value: number) => string) {
  const [visible, setVisible] = useState(false)
  return {
    visible,
    toggle: () => setVisible(value => !value),
    formatCurr: visible ? realFormatCurr : () => HIDDEN_AMOUNT,
  }
}
