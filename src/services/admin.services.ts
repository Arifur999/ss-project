import { http } from '../lib/httpClient'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- Team management (owner) - replaces the manage-users edge function ----------
export const listTeamUsers = () => http.get<any[]>('/users/list')
export const createTeamUser = (payload: { email: string; password: string; full_name: string; role: string; phone?: string }) =>
  http.post<any>('/users/create', payload)
export const updateTeamUser = (payload: { user_id: string; role?: string; full_name?: string; phone?: string; is_active?: boolean; password?: string }) =>
  http.put<any>('/users/update', payload)
export const deleteTeamUser = (userId: string) => http.delete<any>('/users/delete', { user_id: userId })

// ---------- Subscription (owner) ----------
export const getMySubscription = () => http.get<any>('/subscriptions/my')
export const choosePlan = (payload: { plan_type: 'free_trial' | 'yearly' }) =>
  http.post<any>('/subscriptions/choose-plan', payload)
// Step 2 of manual bKash checkout: submit the sender number + transaction id.
export const submitManualPayment = (payload: { sender_number: string; trx_id: string }) =>
  http.post<any>('/subscriptions/submit-payment', payload)

// ---------- Platform settings (payment info + reminder template) ----------
// Public-ish: any authenticated user can read where to send bKash payment.
export const getPaymentInfo = () =>
  http.get<{ bkash_number: string; bkash_qr_url: string; yearly_price: number; yearly_original_price: number }>('/platform-settings/payment-info')
// Super admin only: full settings incl. the reminder email template.
export const getPlatformSettings = () => http.get<any>('/platform-settings')
export const savePlatformSettings = (payload: any) => http.put<any>('/platform-settings', payload)
export const sendTestReminder = () => http.post<{ sent: boolean; subject: string; html: string }>('/platform-settings/test-reminder')

// ---------- Super admin ----------
export const getOwners = () => http.get<any[]>('/super-admin/owners')
export const updateOwnerSubscription = (ownerId: string, payload: any) =>
  http.patch<any>(`/super-admin/owners/${ownerId}/subscription`, payload)
export const grantTrialExtension = (ownerId: string) =>
  http.post<any>(`/super-admin/owners/${ownerId}/grant-trial-extension`)
export const deleteOwner = (ownerId: string) => http.delete<any>(`/super-admin/owners/${ownerId}`)
export const getSubscriptionPayments = () => http.get<any[]>('/super-admin/payments')
export const updateSubscriptionPayment = (id: string, payload: any) => http.patch<any>(`/super-admin/payments/${id}`, payload)
export const getAdminActivities = (limit = 100) => http.get<any[]>(`/super-admin/activities?limit=${limit}`)
export const getSuperAdminStats = () => http.get<any>('/super-admin/stats')
export const getSuperAdminReports = () => http.get<any>('/super-admin/reports')

// ---------- Recycle bin ----------
export const getRecycleBinItems = (type?: string) =>
  http.get<any[]>(type ? `/recycle-bin?type=${type}` : '/recycle-bin')
export const restoreRecycleBinItem = (id: string) => http.post<any>(`/recycle-bin/${id}/restore`)
export const deleteRecycleBinItemPermanently = (id: string) => http.delete<any>(`/recycle-bin/${id}`)
export const emptyRecycleBin = () => http.delete<any>('/recycle-bin/empty')
