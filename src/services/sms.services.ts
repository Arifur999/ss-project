import { http } from '../lib/httpClient'

// ---- Shared types ----
export type SmsPackage = {
  id: string
  name: string
  sms_count: number
  price: number
  active: boolean
  created_at: string
}

export type SmsWallet = { balance: number; updated_at: string }

export type SmsPurchase = {
  id: string
  owner_id: string
  package_id?: string | null
  package_name: string
  sms_count: number
  amount: number
  status: 'pending' | 'paid' | 'rejected'
  method: string
  sender_number: string
  trx_id: string
  invoice_no: string
  notes: string
  date: string
  created_at: string
  owner_name?: string
  owner_email?: string
}

export type SmsMessage = {
  id: string
  recipient_count: number
  segments: number
  credits_used: number
  message: string
  is_unicode: boolean
  status: 'sent' | 'failed'
  shoot_id: string
  response: string
  created_at: string
}

export type SmsSendResult = {
  recipients: number
  segments: number
  credits_used: number
  balance: number
  message: SmsMessage
}

// ---- Owner ----
export const getSmsWallet = () => http.get<SmsWallet>('/sms/wallet')
export const getSmsPackages = () => http.get<SmsPackage[]>('/sms/packages')
export const submitSmsPurchase = (payload: { package_id: string; sender_number: string; trx_id: string }) =>
  http.post<SmsPurchase>('/sms/purchases', payload)
export const getMySmsPurchases = () => http.get<SmsPurchase[]>('/sms/purchases')
export const sendSms = (payload: { recipients: string[]; message: string }) =>
  http.post<SmsSendResult>('/sms/send', payload)
export const getSmsMessages = () => http.get<SmsMessage[]>('/sms/messages')

// ---- Super admin ----
export const adminGetSmsPackages = () => http.get<SmsPackage[]>('/sms/admin/packages')
export const adminCreateSmsPackage = (payload: { name: string; sms_count: number; price: number; active?: boolean }) =>
  http.post<SmsPackage>('/sms/admin/packages', payload)
export const adminUpdateSmsPackage = (id: string, payload: Partial<{ name: string; sms_count: number; price: number; active: boolean }>) =>
  http.patch<SmsPackage>(`/sms/admin/packages/${id}`, payload)
export const adminDeleteSmsPackage = (id: string) => http.delete<{ id: string }>(`/sms/admin/packages/${id}`)
export const adminGetSmsPurchases = () => http.get<SmsPurchase[]>('/sms/admin/purchases')
export const adminUpdateSmsPurchase = (id: string, status: 'pending' | 'paid' | 'rejected') =>
  http.patch<SmsPurchase>(`/sms/admin/purchases/${id}`, { status })
export const adminGetSmsBalance = () => http.get<{ success: boolean; balance: number | null; raw: string }>('/sms/admin/balance')
