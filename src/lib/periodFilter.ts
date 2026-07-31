// Shared period filtering for list pages: All / This Month / This Year / Custom.
export type Period = 'all' | 'month' | 'year' | 'custom'

export function inPeriod(dateStr: string, period: Period, from: string, to: string): boolean {
  if (period === 'all') return true
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return true
  const now = new Date()
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (period === 'year') return d.getFullYear() === now.getFullYear()
  // custom range - open-ended if only one bound is set
  const start = from ? new Date(from + 'T00:00:00') : null
  const end = to ? new Date(to + 'T23:59:59') : null
  if (start && d < start) return false
  if (end && d > end) return false
  return true
}

export function periodLabel(period: Period, from: string, to: string): string {
  if (period === 'month') return 'This Month'
  if (period === 'year') return 'This Year'
  if (period === 'custom') return `${from || '...'} to ${to || '...'}`
  return 'All Time'
}
