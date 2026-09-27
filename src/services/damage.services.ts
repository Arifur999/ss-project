import { http } from '../lib/httpClient'
import type { RecycleMeta } from './finance.services'

// Damage moves stock and FIFO cost, so it goes through the service layer
// rather than the supabase shim - the rule the shim's own header states.

export type DamageSource = 'own_stock' | 'supplier'
export type DamageAction = 'repair' | 'return' | 'exchange'
export type DamageStatus = 'pending' | 'partial' | 'completed'
export type DamageReceiveResult = 'repaired' | 'replaced' | 'scrapped'

export type DamageReceive = {
  id: string
  damage_item_id: string
  receive_date: string
  receiver_name: string
  received_qty: number
  result: DamageReceiveResult
  notes: string
}

export type DamageItem = {
  id: string
  product_id: string | null
  product_code: string
  product_name: string
  qty: number
  /** The FIFO cost of the stock that left, not the product's list DP. */
  unit_cost: number
  total_cost: number
  received_qty: number
  damage_receives: DamageReceive[]
}

export type DamageEntry = {
  id: string
  doc_no: string
  date: string
  source: DamageSource
  action: DamageAction
  supplier_id: string | null
  supplier_name: string
  status: DamageStatus
  notes: string
  created_at: string
  damage_items: DamageItem[]
}

export type DamageTransactions = {
  expenses: Array<Record<string, unknown>>
  other_incomes: Array<Record<string, unknown>>
}

export const getDamageEntries = (statuses?: string[]) =>
  http.get<DamageEntry[]>('/damage' + (statuses?.length ? `?status=${statuses.join(',')}` : ''))

export const createDamageEntry = (payload: {
  date: string
  source: DamageSource
  action: DamageAction
  supplier_id?: string | null
  supplier_name?: string
  notes?: string
  items: Array<{ product_id: string; product_code?: string; product_name: string; qty: number }>
}) => http.post<DamageEntry>('/damage', payload)

export const updateDamageEntry = (id: string, payload: Record<string, unknown>) =>
  http.patch<DamageEntry>(`/damage/${id}`, payload)

export const receiveDamageItem = (id: string, payload: {
  damage_item_id: string
  receive_date: string
  receiver_name?: string
  received_qty: number
  result: DamageReceiveResult
  notes?: string
}) => http.post<DamageEntry>(`/damage/${id}/receive`, payload)

export const deleteDamageEntry = (id: string, recycle?: RecycleMeta) =>
  http.delete<{ id: string }>(`/damage/${id}`, recycle ? { recycle } : undefined)

export const getDamageTransactions = () => http.get<DamageTransactions>('/damage/transactions')

export const addDamageTransaction = (id: string, payload: {
  kind: 'repair_cost' | 'supplier_refund'
  date: string
  amount: number
  account_id: string
  account_name?: string
  category_id?: string
  category_name?: string
  notes?: string
}) => http.post<Record<string, unknown>>(`/damage/${id}/transactions`, payload)
