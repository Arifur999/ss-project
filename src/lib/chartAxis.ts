/**
 * One unit for a whole money axis, chosen from its tallest bar.
 *
 * Two mistakes it exists to prevent. Dividing every tick by 1000 draws "৳0k"
 * five times over at the scale the platform pages report, where a single Tk 599
 * payment is a normal month. Deciding per tick puts two units on one scale - an
 * axis topping out at 150,000 drew "৳75,000" and "৳113k" as neighbours.
 *
 * Shared because the Reports chart and the Finance chart sit in the same
 * section, show the same platform revenue, and had drifted onto two different
 * formatters.
 */
export function moneyAxisFormatter(peak: number) {
  const useThousands = Math.abs(Number(peak) || 0) >= 100000
  return (value: number) => {
    const amount = Number(value) || 0
    if (useThousands) return `৳${Math.round(amount / 1000)}k`
    return `৳${amount.toLocaleString('en-BD')}`
  }
}

/** The tallest value in a series, for picking that unit. */
export function seriesPeak<T>(rows: T[], pick: (row: T) => unknown): number {
  return rows.reduce((top, row) => Math.max(top, Number(pick(row)) || 0), 0)
}
