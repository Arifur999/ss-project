import { http } from '../lib/httpClient'

/** One thing that was done: a sale written, an expense entered, stock taken in. */
export type ActivityEvent = {
  at: string
  kind: string
  title: string
  subtitle: string
  amount: number
  /** Money in, money out, or neither - stock movements carry no amount. */
  direction: 'in' | 'out' | 'none'
}

export type DayActivity = {
  date: string
  count: number
  totals: { in: number; out: number }
  events: ActivityEvent[]
}

export const getDayActivity = (date: string) =>
  http.get<DayActivity>(`/activity/day?date=${date}`)
