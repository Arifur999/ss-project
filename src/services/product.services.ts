import { api, http } from '../lib/httpClient'


export const getProducts = () => http.get<any[]>('/products')

// One page of products, plus how many match in total. Goes through `api`
// rather than `http` because `http` unwraps to `data` and drops `meta`, and
// the total is what a paged list needs to know when to stop and what to show
// as its record count.
export const getProductsPage = async (options: { page: number; limit: number; search?: string }) => {
  const params = new URLSearchParams({ page: String(options.page), limit: String(options.limit) })
  if (options.search) params.set('search', options.search)
  const response = await api.get(`/products?${params.toString()}`)
  const rows = (response.data?.data || []) as any[]
  return { rows, total: Number(response.data?.meta?.total ?? rows.length) }
}

// Distinct categories in use. The form's suggestion list used to be derived
// from whatever products the page had loaded; with one page in memory that
// would only ever show a handful.
export const getProductCategories = () => http.get<string[]>('/products/categories')

// Ids of every product matching a search. "Select all" and CSV export act on
// the whole filtered set, not the rows on screen, so they ask for this instead
// of paging through full records.
export const getProductIds = (search?: string) =>
  http.get<string[]>(`/products/ids${search ? `?search=${encodeURIComponent(search)}` : ''}`)

// Every matching product, for CSV export. Deliberately separate from the paged
// list: it is a deliberate, occasional action where waiting is acceptable, and
// exporting only the rows that happened to be scrolled into view would be
// silently wrong.
export const getAllProductsForExport = async (search?: string) => {
  const response = await api.get(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`)
  return (response.data?.data || []) as any[]
}
export const getDeletedProducts = () => http.get<any[]>('/products?deleted=true')
export const createProduct = (payload: any) => http.post<any>('/products', payload)
export const bulkUpsertProducts = (products: any[]) => http.post<any[]>('/products/bulk-upsert', { products })
export type PriceRow = {
  product_code: string
  cost_price?: number
  selling_price?: number
  dp_discount?: number
  mrp_discount?: number
}

export type PriceUpdateResult = {
  dry_run: boolean
  matched: { product_code: string; name: string; before: Record<string, number>; after: Record<string, number> }[]
  unchanged: string[]
  notFound: string[]
}

export type PriceUpdateBatch = {
  id: string
  file_name: string
  updated_count: number
  skipped_count: number
  unchanged_count: number
  status: string
  created_at: string
}

export const getPriceUpdates = () => http.get<PriceUpdateBatch[]>('/products/price-updates')

// Filed once per finished run, not per batch of 100.
export const recordPriceUpdate = (payload: {
  file_name?: string
  updated_count: number
  skipped_count?: number
  unchanged_count?: number
  status?: 'completed' | 'partial'
}) => http.post<PriceUpdateBatch>('/products/price-updates', payload)

// Price-only bulk update, matched on product code. Deliberately not
// /products/bulk-upsert: that one creates a product when the code is unknown.
export const bulkUpdateProductPrices = (prices: PriceRow[], dryRun: boolean) =>
  http.post<PriceUpdateResult>('/products/bulk-update-prices', { prices, dry_run: dryRun })

export const updateProduct = (id: string, payload: any) => http.patch<any>(`/products/${id}`, payload)
export const deleteProduct = (id: string) => http.delete<any>(`/products/${id}`)

// ---------- Inventory ----------
export const getInventory = () => http.get<any[]>('/inventory')
// One page of the stock list, with every quantity already worked out on the
// server. The page used to fetch six whole tables and join them by hand, which
// cannot survive ten thousand products. totalStockValue covers every matching
// row, not just the page.
export const getInventoryPage = async (options: { page: number; limit: number; search?: string; status?: string }) => {
  const params = new URLSearchParams({ page: String(options.page), limit: String(options.limit) })
  if (options.search) params.set('search', options.search)
  if (options.status && options.status !== 'all') params.set('status', options.status)
  const response = await api.get(`/inventory/list?${params.toString()}`)
  const payload = response.data?.data || {}
  return {
    rows: (payload.rows || []) as any[],
    total: Number(response.data?.meta?.total ?? 0),
    totalStockValue: Number(payload.totalStockValue ?? 0),
  }
}

export const getInventoryHistory = (productId?: string) =>
  http.get<any[]>(productId ? `/inventory/history?product_id=${productId}` : '/inventory/history')
export const getInventoryBatches = (productId?: string) =>
  http.get<any[]>(productId ? `/inventory/batches?product_id=${productId}` : '/inventory/batches')
export const adjustInventory = (payload: any) => http.post<any>('/inventory/adjust', payload)
export const setInventoryDpPrice = (productId: string, dpPrice: number | null) =>
  http.patch<any>('/inventory/dp-price', { product_id: productId, dp_price: dpPrice })

// ---------- Uploads ----------
export const uploadImage = async (file: File) => {
  const formData = new FormData()
  formData.append('image', file)
  return http.post<{ url: string; public_id: string }>('/uploads/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
