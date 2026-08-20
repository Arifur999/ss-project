import { http } from '../lib/httpClient'

// The platform's own books - super admin only. Separate from the owner-facing
// expense/withdrawal services, which are scoped to a customer workspace.

export type PlatformExpense = {
  id: string
  date: string
  category: string
  amount: number | string
  notes: string
  created_at: string
}

export type PlatformWithdrawal = {
  id: string
  date: string
  amount: number | string
  taken_by: string
  notes: string
  created_at: string
}

export type PlatformFinanceSummary = {
  subscription_monthly: number
  subscription_yearly: number
  subscription_other: number
  subscription_income: number
  sms_income: number
  total_income: number
  total_expense: number
  expense_count: number
  profit: number
  total_withdrawn: number
  withdrawal_count: number
  available: number
  monthly: { month: string; income: number; subscription: number; sms: number; expense: number; profit: number }[]
}

export type FinanceRange = { from?: string; to?: string }

function query(range: FinanceRange): string {
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const text = params.toString()
  return text ? `?${text}` : ''
}

export const getPlatformSummary = (range: FinanceRange = {}) =>
  http.get<PlatformFinanceSummary>(`/platform-finance/summary${query(range)}`)

export const getPlatformExpenses = (range: FinanceRange = {}) =>
  http.get<PlatformExpense[]>(`/platform-finance/expenses${query(range)}`)

export const createPlatformExpense = (payload: { date: string; category: string; amount: number; notes?: string }) =>
  http.post<PlatformExpense>('/platform-finance/expenses', payload)

export const updatePlatformExpense = (id: string, payload: Partial<{ date: string; category: string; amount: number; notes: string }>) =>
  http.patch<PlatformExpense>(`/platform-finance/expenses/${id}`, payload)

export const deletePlatformExpense = (id: string) =>
  http.delete<{ id: string }>(`/platform-finance/expenses/${id}`)

export const getPlatformWithdrawals = (range: FinanceRange = {}) =>
  http.get<PlatformWithdrawal[]>(`/platform-finance/withdrawals${query(range)}`)

export const createPlatformWithdrawal = (payload: { date: string; amount: number; taken_by?: string; notes?: string }) =>
  http.post<PlatformWithdrawal>('/platform-finance/withdrawals', payload)

export const updatePlatformWithdrawal = (id: string, payload: Partial<{ date: string; amount: number; taken_by: string; notes: string }>) =>
  http.patch<PlatformWithdrawal>(`/platform-finance/withdrawals/${id}`, payload)

export const deletePlatformWithdrawal = (id: string) =>
  http.delete<{ id: string }>(`/platform-finance/withdrawals/${id}`)
