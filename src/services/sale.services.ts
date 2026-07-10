import { http } from '../lib/httpClient'
import { RecycleMeta } from './finance.services'


export const getSales = () => http.get<any[]>('/sales')
export const createSale = (payload: any) => http.post<any>('/sales', payload)
export const updateSale = (id: string, payload: any) => http.put<any>(`/sales/${id}`, payload)
export const deleteSale = (id: string, recycle?: RecycleMeta) => http.delete<any>(`/sales/${id}`, { recycle })

export const setManualSaleItemCost = (itemId: string, unitCost: number) =>
  http.post<any>(`/sales/items/${itemId}/manual-cost`, { unit_cost: unitCost })

// ---------- Deliveries ----------
export const addSaleDelivery = (saleId: string, payload: any) => http.post<any>(`/sales/${saleId}/deliveries`, payload)
export const deleteSaleDelivery = (deliveryId: string) => http.delete<any>(`/sales/deliveries/${deliveryId}`)

// ---------- Sale payments ----------
export const getSalePayments = (saleId?: string) =>
  http.get<any[]>(saleId ? `/sale-payments?sale_id=${saleId}` : '/sale-payments')
export const createSalePayment = (payload: any) => http.post<any>('/sale-payments', payload)
export const updateSalePayment = (id: string, payload: any) => http.patch<any>(`/sale-payments/${id}`, payload)
export const deleteSalePayment = (id: string) => http.delete<any>(`/sale-payments/${id}`)

// ---------- Customer payments (due received) ----------
export const getCustomerPayments = () => http.get<any[]>('/customer-payments')
export const createCustomerPayment = (payload: any) => http.post<any>('/customer-payments', payload)
export const updateCustomerPayment = (id: string, payload: any) => http.patch<any>(`/customer-payments/${id}`, payload)
export const deleteCustomerPayment = (id: string, recycle?: RecycleMeta) =>
  http.delete<any>(`/customer-payments/${id}`, { recycle })
