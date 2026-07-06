import { http } from '../lib/httpClient'
import { RecycleMeta } from './finance.services'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const getPurchases = (statuses?: string[]) =>
  http.get<any[]>(statuses && statuses.length > 0 ? `/purchases?status=${statuses.join(',')}` : '/purchases')

export const createPurchase = (payload: any) => http.post<any>('/purchases', payload)
export const updatePurchase = (id: string, payload: any) => http.patch<any>(`/purchases/${id}`, payload)
export const receivePurchaseItem = (purchaseId: string, payload: any) =>
  http.post<any>(`/purchases/${purchaseId}/receive`, payload)
export const updatePurchaseReceive = (receiveId: string, receivedQty: number) =>
  http.patch<any>(`/purchases/receives/${receiveId}`, { received_qty: receivedQty })
export const deletePurchaseReceive = (receiveId: string) =>
  http.delete<any>(`/purchases/receives/${receiveId}`)
export const setPurchaseItemReceivedQty = (itemId: string, receivedQty: number) =>
  http.patch<any>(`/purchases/items/${itemId}/received-qty`, { received_qty: receivedQty })
export const deletePurchase = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/purchases/${id}`, { recycle })

// ---------- Supplier payments ----------
export const getSupplierPayments = () => http.get<any[]>('/supplier-payments')
export const createSupplierPayment = (payload: any) => http.post<any>('/supplier-payments', payload)
export const updateSupplierPayment = (id: string, payload: any) => http.patch<any>(`/supplier-payments/${id}`, payload)
export const deleteSupplierPayment = (id: string, recycle?: RecycleMeta) =>
  http.delete<any>(`/supplier-payments/${id}`, { recycle })
