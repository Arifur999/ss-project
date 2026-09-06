import { http } from '../lib/httpClient'

/**
 * A report, ready to be read - every figure already formatted the way the page
 * shows it, so the email and the screen cannot disagree.
 *
 * The server never takes a recipient from this: it looks the owner's address up
 * itself, so the only inbox this can reach is the one belonging to the
 * workspace you are signed in to.
 */
export type EmailReportPayload = {
  title: string
  period: string
  summary: { label: string; value: string }[]
  tables: { title: string; columns: string[]; rows: string[][] }[]
}

export const emailReport = (payload: EmailReportPayload) =>
  http.post<{ sent: boolean; email: string }>('/reports/email', payload)
