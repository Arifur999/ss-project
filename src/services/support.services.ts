import { http } from '../lib/httpClient'

/**
 * Where a ticket stands. Set by the server from who spoke last, never by the
 * client - see the backend's supportRules.
 */
export type SupportTicketStatus = 'open' | 'answered' | 'solved'

export type SupportMessage = {
  id: string
  body: string
  from_admin: boolean
  author_name: string
  created_at: string
}

export type SupportTicket = {
  id: string
  owner_id: string
  opened_by: string
  subject: string
  status: SupportTicketStatus
  created_at: string
  last_message_at: string
  solved_at: string | null
  solved_by: string | null
  messages: SupportMessage[]
  // Only the platform's inbox gets this - it is who is asking.
  owner?: { id: string; full_name: string | null; email: string; phone: string | null }
}

// ---- The customer's side ----
export const createSupportTicket = (payload: { subject?: string; message: string }) =>
  http.post<SupportTicket>('/support-tickets', payload)
export const getMySupportTickets = () => http.get<SupportTicket[]>('/support-tickets/my')

// ---- The platform's side ----
export const getAllSupportTickets = (status?: SupportTicketStatus) =>
  http.get<SupportTicket[]>(`/support-tickets${status ? `?status=${status}` : ''}`)
export const markSupportTicketSolved = (id: string) =>
  http.patch<SupportTicket>(`/support-tickets/${id}/solve`)

// ---- Both ----
export const replyToSupportTicket = (id: string, message: string) =>
  http.post<SupportTicket>(`/support-tickets/${id}/reply`, { message })
