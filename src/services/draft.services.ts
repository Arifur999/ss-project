import { http } from '../lib/httpClient'

/**
 * A parked purchase order or invoice.
 *
 * `data` is the form exactly as it stood when it was saved, and the server does
 * not look inside it - which is what makes a half-finished order safe to keep.
 * A draft is not an order: nothing about it reaches stock, dues, ledger totals
 * or an order number until somebody opens it and presses the real button.
 */
export type DraftKind = 'purchase_order' | 'sale'

export type Draft = {
  id: string
  kind: DraftKind
  /** Supplier or customer name. */
  title: string
  /** si_no or invoice_no. */
  subtitle: string
  amount: number
  payload_version: number
  created_by: string | null
  updated_by: string | null
  /** Resolved server-side, so a shop can see whose order to finish. */
  created_by_name: string
  updated_by_name: string
  created_at: string
  updated_at: string
}

/** The list leaves the snapshot out; only getDraft carries it. */
export type DraftWithData = Draft & { data: Record<string, unknown> }

export type SaveDraftPayload = {
  kind: DraftKind
  title?: string
  subtitle?: string
  amount?: number
  payload_version?: number
  data: Record<string, unknown>
}

export const getDrafts = (kind: DraftKind) => http.get<Draft[]>(`/drafts?kind=${kind}`)
export const getDraft = (id: string) => http.get<DraftWithData>(`/drafts/${id}`)
export const saveDraft = (payload: SaveDraftPayload) => http.post<DraftWithData>('/drafts', payload)
export const updateDraft = (id: string, payload: SaveDraftPayload) =>
  http.patch<DraftWithData>(`/drafts/${id}`, payload)
export const deleteDraft = (id: string) => http.delete<{ id: string }>(`/drafts/${id}`)
