// Shared period filtering for list pages.
//
// All / Today / Yesterday / This Week / This Month / This Year / Custom, on
// every list that has a date column. Most of them used to offer only the last
// three, so answering "what happened today" meant opening Custom Range and
// typing the same date into both boxes - for the commonest question a shop
// asks its own books.
//
// This Week runs Saturday to today. Saturday because that is where the working
// week starts here, and "to today" rather than to Friday because a week-to-date
// range must not promise rows from days that have not happened yet.
export type Period = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'

/** Midnight-local YYYY-MM-DD, the shape every date column on the site stores. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

/** Saturday of the current week, at the start of the day. */
function weekStart(): Date {
  const d = new Date()
  // getDay(): Sunday 0 ... Saturday 6. Saturday is day 0 of this week, Sunday
  // day 1, so the offset is (getDay() + 1) % 7.
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7))
  return d
}

export function inPeriod(dateStr: string, period: Period, from: string, to: string): boolean {
  if (period === 'all') return true
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return true
  const now = new Date()
  // Compared as day strings rather than timestamps: a stored date can arrive as
  // "2026-09-09" or as a full timestamp, and only the day part is being asked
  // about either way.
  if (period === 'today') return iso(d) === iso(now)
  if (period === 'yesterday') return iso(d) === iso(daysAgo(1))
  if (period === 'week') return iso(d) >= iso(weekStart()) && iso(d) <= iso(now)
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (period === 'year') return d.getFullYear() === now.getFullYear()
  // custom range - open-ended if only one bound is set
  const start = from ? new Date(from + 'T00:00:00') : null
  const end = to ? new Date(to + 'T23:59:59') : null
  if (start && d < start) return false
  if (end && d > end) return false
  return true
}

// The same choices expressed as concrete YYYY-MM-DD bounds, for pages whose
// totals are computed on the server and so need to send the range rather than
// filter an already-loaded list with inPeriod().
export function periodToRange(period: Period, from: string, to: string): { from?: string; to?: string } {
  const now = new Date()
  if (period === 'today') {
    return { from: iso(now), to: iso(now) }
  }
  if (period === 'yesterday') {
    const day = iso(daysAgo(1))
    return { from: day, to: day }
  }
  if (period === 'week') {
    // Ends today, not on Friday: a week-to-date range must not promise rows
    // from days that have not happened.
    return { from: iso(weekStart()), to: iso(now) }
  }
  if (period === 'month') {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  }
  if (period === 'year') {
    return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(new Date(now.getFullYear(), 11, 31)) }
  }
  if (period === 'custom') return { from: from || undefined, to: to || undefined }
  return {}
}

export function periodLabel(period: Period, from: string, to: string): string {
  if (period === 'today') return 'Today'
  if (period === 'yesterday') return 'Yesterday'
  if (period === 'week') return 'This Week'
  if (period === 'month') return 'This Month'
  if (period === 'year') return 'This Year'
  if (period === 'custom') return `${from || '...'} to ${to || '...'}`
  return 'All Time'
}
