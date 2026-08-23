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
 * formatters - and because the owner-facing charts had the hard divide too.
 */

/**
 * The value Recharts will actually put at the top of the axis. It rounds the
 * domain up to a round number, so a peak of 98,000 is drawn on an axis whose
 * top tick reads 100,000 - and the unit has to be chosen for the tick that gets
 * rendered, not for the data.
 */
function niceCeil(value: number): number {
  const amount = Math.abs(Number(value) || 0)
  if (amount === 0) return 0
  const magnitude = Math.pow(10, Math.floor(Math.log10(amount)))
  return Math.ceil(amount / magnitude) * magnitude
}

/** ৳120,000 - the platform pages' money format, defined once. */
export function formatTaka(value: number): string {
  return `৳${(Number(value) || 0).toLocaleString('en-BD')}`
}

export type MoneyAxisOptions = {
  /**
   * What goes in front of the number. Each page passes its own so the axis
   * matches the tooltip and cards beside it: the platform Reports page is in
   * ৳, the Finance page is in Tk, and the owner charts carry no symbol at all.
   */
  symbol?: string
  /** en-BD groups as 1,20,000; en-US as 120,000. Match the page, again. */
  locale?: string
}

export function moneyAxisFormatter(peak: number, options: MoneyAxisOptions = {}) {
  const symbol = options.symbol ?? '৳'
  const locale = options.locale ?? 'en-BD'
  // Measured against the top tick, not the peak, so a chart peaking at 98,000
  // does not draw a full-precision "100,000" in an axis sized for "100k".
  const useThousands = niceCeil(peak) >= 100000
  return (value: number) => {
    const amount = Number(value) || 0
    if (useThousands) return `${symbol}${Math.round(amount / 1000).toLocaleString(locale)}k`
    return `${symbol}${amount.toLocaleString(locale)}`
  }
}

/**
 * The largest distance from zero in a series, for picking that unit.
 *
 * Distance, not value: a profit series that runs to -90,000 needs an axis as
 * tall as one that runs to +90,000, and seeding the maximum at 0 used to make
 * an all-negative series report a peak of 0 - which then picked full-precision
 * ticks for a chart that had no room for them.
 */
export function seriesPeak<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((top, row) => Math.max(top, Math.abs(Number(pick(row)) || 0)), 0)
}
