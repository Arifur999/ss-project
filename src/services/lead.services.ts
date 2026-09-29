import { http } from '../lib/httpClient'

/**
 * A prospect nobody has sold to yet.
 *
 * Kept apart from marketing contacts, which are only a name and a number: a
 * lead carries who they are and where, because that is what makes a follow-up
 * possible weeks after the visit that produced it.
 */
export type Lead = {
  id: string
  date: string
  organization: string
  designation: string
  name: string
  phone: string
  address: string
  notes: string
  created_at: string
}

export type LeadPayload = {
  date: string
  organization: string
  designation?: string
  name: string
  phone: string
  address?: string
  notes?: string
}

export const getLeads = () => http.get<Lead[]>('/leads')
export const createLead = (payload: LeadPayload) => http.post<Lead>('/leads', payload)
export const updateLead = (id: string, payload: Partial<LeadPayload>) => http.patch<Lead>(`/leads/${id}`, payload)
export const deleteLead = (id: string) => http.delete<{ message: string }>(`/leads/${id}`)
