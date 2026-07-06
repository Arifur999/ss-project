import { http } from '../lib/httpClient'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- Business settings ----------
export const getBusinessSettings = () => http.get<any>('/business-settings')
export const saveBusinessSettings = (payload: any) => http.put<any>('/business-settings', payload)

// ---------- Shareholders ----------
export const getShareholders = () => http.get<any[]>('/shareholders')
export const createShareholder = (payload: any) => http.post<any>('/shareholders', payload)
export const updateShareholder = (id: string, payload: any) => http.patch<any>(`/shareholders/${id}`, payload)
export const deleteShareholder = (id: string) => http.delete<any>(`/shareholders/${id}`)

// ---------- Accounts ----------
export const getAccounts = () => http.get<any[]>('/accounts')
export const createAccount = (payload: any) => http.post<any>('/accounts', payload)
export const updateAccount = (id: string, payload: any) => http.patch<any>(`/accounts/${id}`, payload)
export const deleteAccount = (id: string) => http.delete<any>(`/accounts/${id}`)

// ---------- Account transfers ----------
export const getAccountTransfers = () => http.get<any[]>('/account-transfers')
export const createAccountTransfer = (payload: any) => http.post<any>('/account-transfers', payload)
export const deleteAccountTransfer = (id: string) => http.delete<any>(`/account-transfers/${id}`)

// ---------- Monthly targets ----------
export const getMonthlyTargets = () => http.get<any[]>('/monthly-targets')
export const saveMonthlyTarget = (payload: any) => http.put<any>('/monthly-targets', payload)
export const deleteMonthlyTarget = (id: string) => http.delete<any>(`/monthly-targets/${id}`)

// ---------- Expense categories ----------
export const getExpenseCategories = () => http.get<any[]>('/expense-categories')
export const createExpenseCategory = (payload: any) => http.post<any>('/expense-categories', payload)
export const updateExpenseCategory = (id: string, payload: any) => http.patch<any>(`/expense-categories/${id}`, payload)
export const deleteExpenseCategory = (id: string) => http.delete<any>(`/expense-categories/${id}`)

// ---------- Suppliers ----------
export const getSuppliers = () => http.get<any[]>('/suppliers')
export const createSupplier = (payload: any) => http.post<any>('/suppliers', payload)
export const updateSupplier = (id: string, payload: any) => http.patch<any>(`/suppliers/${id}`, payload)
export const deleteSupplier = (id: string) => http.delete<any>(`/suppliers/${id}`)

// ---------- Customers ----------
export const getCustomers = () => http.get<any[]>('/customers')
export const createCustomer = (payload: any) => http.post<any>('/customers', payload)
export const updateCustomer = (id: string, payload: any) => http.patch<any>(`/customers/${id}`, payload)
export const deleteCustomer = (id: string) => http.delete<any>(`/customers/${id}`)
