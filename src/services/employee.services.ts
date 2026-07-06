import { http } from '../lib/httpClient'
import { RecycleMeta } from './finance.services'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const getEmployees = () => http.get<any[]>('/employees')
export const createEmployee = (payload: any) => http.post<any>('/employees', payload)
export const updateEmployee = (id: string, payload: any) => http.patch<any>(`/employees/${id}`, payload)
export const deleteEmployee = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/employees/${id}`, { recycle })

// ---------- Salary transactions ----------
export const getSalaryTransactions = (employeeId?: string) =>
  http.get<any[]>(employeeId ? `/salary-transactions?employee_id=${employeeId}` : '/salary-transactions')
export const createSalaryTransaction = (payload: any) => http.post<any>('/salary-transactions', payload)
export const updateSalaryTransaction = (id: string, payload: any) => http.patch<any>(`/salary-transactions/${id}`, payload)
export const deleteSalaryTransaction = (id: string, recycle?: RecycleMeta) =>
  http.delete<any>(`/salary-transactions/${id}`, { recycle })

// ---------- Attendance ----------
export const getAttendance = (filters?: { employee_id?: string; from?: string; to?: string }) => {
  const params = new URLSearchParams()
  if (filters?.employee_id) params.set('employee_id', filters.employee_id)
  if (filters?.from) params.set('from', filters.from)
  if (filters?.to) params.set('to', filters.to)
  const query = params.toString()
  return http.get<any[]>(query ? `/attendance?${query}` : '/attendance')
}
export const saveAttendance = (payload: any) => http.put<any>('/attendance', payload)
export const deleteAttendance = (id: string) => http.delete<any>(`/attendance/${id}`)
