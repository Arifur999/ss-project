import { http } from '../lib/httpClient'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const getProducts = () => http.get<any[]>('/products')
export const getDeletedProducts = () => http.get<any[]>('/products?deleted=true')
export const createProduct = (payload: any) => http.post<any>('/products', payload)
export const bulkUpsertProducts = (products: any[]) => http.post<any[]>('/products/bulk-upsert', { products })
export const updateProduct = (id: string, payload: any) => http.patch<any>(`/products/${id}`, payload)
export const deleteProduct = (id: string) => http.delete<any>(`/products/${id}`)

// ---------- Inventory ----------
export const getInventory = () => http.get<any[]>('/inventory')
export const getInventoryHistory = (productId?: string) =>
  http.get<any[]>(productId ? `/inventory/history?product_id=${productId}` : '/inventory/history')
export const getInventoryBatches = (productId?: string) =>
  http.get<any[]>(productId ? `/inventory/batches?product_id=${productId}` : '/inventory/batches')
export const adjustInventory = (payload: any) => http.post<any>('/inventory/adjust', payload)

// ---------- Uploads ----------
export const uploadImage = async (file: File) => {
  const formData = new FormData()
  formData.append('image', file)
  return http.post<{ url: string; public_id: string }>('/uploads/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
