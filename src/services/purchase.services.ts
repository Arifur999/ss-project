import { http } from '../lib/httpClient'
import { RecycleMeta } from './finance.services'


export const getPurchases = (statuses?: string[]) =>
  http.get<any[]>(statuses && statuses.length > 0 ? `/purchases?status=${statuses.join(',')}` : '/purchases')

export const createPurchase = (payload: any) => http.post<any>('/purchases', payload)
export const updatePurchase = (id: string, payload: any) => http.patch<any>(`/purchases/${id}`, payload)
export const receivePurchaseItem = (purchaseId: string, payload: any) =>
  http.post<any>(`/purchases/${purchaseId}/receive`, payload)
/**
 * Receive every outstanding line on a purchase in one atomic server call.
 *
 * Replaces looping receivePurchaseItem per item, where a failure on item 3 of 5
 * left 1-2 in stock and 3-5 not, with no way to tell which had landed.
 */
export const receiveAllPurchaseItems = (purchaseId: string, payload: { receive_date: string; receiver_name?: string; notes?: string }) =>
  http.post<any>(`/purchases/${purchaseId}/receive-all`, payload)
export const updatePurchaseReceive = (receiveId: string, receivedQty: number) =>
  http.patch<any>(`/purchases/receives/${receiveId}`, { received_qty: receivedQty })
export const deletePurchaseReceive = (receiveId: string) =>
  http.delete<any>(`/purchases/receives/${receiveId}`)
export const setPurchaseItemReceivedQty = (itemId: string, receivedQty: number) =>
  http.patch<any>(`/purchases/items/${itemId}/received-qty`, { received_qty: receivedQty })
export const deletePurchase = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/purchases/${id}`, { recycle })
export const deletePurchaseItem = (itemId: string) => http.delete<any>(`/purchases/items/${itemId}`)
/**
 * Add a line to a purchase that already exists.
 *
 * The server re-totals the purchase and refreshes its shipping status - a new
 * line has received nothing, so a fully-received invoice drops back to partial
 * and the Product Received page will offer the line.
 */
export const addPurchaseItem = (purchaseId: string, payload: any) =>
  http.post<any>(`/purchases/${purchaseId}/items`, payload)

// ---------- Supplier payments ----------
export const getSupplierPayments = () => http.get<any[]>('/supplier-payments')
export const createSupplierPayment = (payload: any) => http.post<any>('/supplier-payments', payload)
export const updateSupplierPayment = (id: string, payload: any) => http.patch<any>(`/supplier-payments/${id}`, payload)
export const deleteSupplierPayment = (id: string, recycle?: RecycleMeta) =>
  http.delete<any>(`/supplier-payments/${id}`, { recycle })
