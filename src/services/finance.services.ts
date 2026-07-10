import { http } from '../lib/httpClient'


export interface RecycleMeta {
  type: string
  title?: string
  subtitle?: string
  amount?: number
}

// ---------- Investments ----------
export const getInvestments = () => http.get<any[]>('/investments')
export const createInvestment = (payload: any) => http.post<any>('/investments', payload)
export const updateInvestment = (id: string, payload: any) => http.patch<any>(`/investments/${id}`, payload)
export const deleteInvestment = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/investments/${id}`, { recycle })

// ---------- Profit withdrawals ----------
export const getProfitWithdrawals = () => http.get<any[]>('/profit-withdrawals')
export const createProfitWithdrawal = (payload: any) => http.post<any>('/profit-withdrawals', payload)
export const updateProfitWithdrawal = (id: string, payload: any) => http.patch<any>(`/profit-withdrawals/${id}`, payload)
export const deleteProfitWithdrawal = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/profit-withdrawals/${id}`, { recycle })

// ---------- Loan lenders ----------
export const getLoanLenders = () => http.get<any[]>('/loan-lenders')
export const createLoanLender = (payload: any) => http.post<any>('/loan-lenders', payload)
export const updateLoanLender = (id: string, payload: any) => http.patch<any>(`/loan-lenders/${id}`, payload)
export const deleteLoanLender = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/loan-lenders/${id}`, { recycle })

// ---------- Loans ----------
export const getLoans = () => http.get<any[]>('/loans')
export const createLoan = (payload: any) => http.post<any>('/loans', payload)
export const updateLoan = (id: string, payload: any) => http.patch<any>(`/loans/${id}`, payload)
export const deleteLoan = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/loans/${id}`, { recycle })

// ---------- Expenses ----------
export const getExpenses = () => http.get<any[]>('/expenses')
export const createExpense = (payload: any) => http.post<any>('/expenses', payload)
export const updateExpense = (id: string, payload: any) => http.patch<any>(`/expenses/${id}`, payload)
export const deleteExpense = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/expenses/${id}`, { recycle })

// ---------- Other incomes ----------
export const getOtherIncomes = () => http.get<any[]>('/other-incomes')
export const createOtherIncome = (payload: any) => http.post<any>('/other-incomes', payload)
export const updateOtherIncome = (id: string, payload: any) => http.patch<any>(`/other-incomes/${id}`, payload)
export const deleteOtherIncome = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/other-incomes/${id}`, { recycle })
