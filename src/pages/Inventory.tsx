import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Download, Image } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { setInventoryDpPrice } from '../services/product.services'
import PageHeader from '../components/PageHeader'
import { useLang } from '../context/LanguageContext'
import toast from 'react-hot-toast'

type InventoryRow = {
  id: string; product_id: string; available_qty: number; upcoming_qty: number; dp_price: number | null
  products: ProductRow
  opening_qty: number; order_qty: number; received_qty: number; sales_qty: number
  fifo_stock_value: number; fifo_average_dp: number
}

type ProductRow = {
  id: string
  name: string
  product_code: string
  cost_price: number | null
  image_url: string | null
  opening_qty?: number | null
  suppliers?: { name: string; company_name: string } | null
}

type InventoryCache = {
  search: string
  statusFilter: InventoryStatusFilter
}

type InventoryStatus = 'available' | 'upcoming' | 'low_stock' | 'out_of_stock'
type InventoryStatusFilter = 'all' | 'available' | 'out_of_stock' | 'upcoming'

const inventoryCacheKey = 'inventory_page_cache_v3'
const productListCacheKey = 'product_list_cache_v1'
const productOpeningQtyStorageKey = 'product_opening_qty_v1'
const pageSize = 1000
const insertChunkSize = 200

function readInventoryCache(): InventoryCache {
  if (typeof window === 'undefined') return { search: '', statusFilter: 'all' }
  try {
    const value = window.sessionStorage.getItem(inventoryCacheKey)
    if (!value) return { search: '', statusFilter: 'all' }
    const parsed = JSON.parse(value)
    const statusFilter = ['all', 'available', 'out_of_stock', 'upcoming'].includes(parsed.statusFilter)
      ? parsed.statusFilter
      : 'all'
    return {
      search: typeof parsed.search === 'string' ? parsed.search : '',
      statusFilter,
    }
  } catch {
    return { search: '', statusFilter: 'all' }
  }
}

function writeInventoryCache(cache: InventoryCache) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(inventoryCacheKey, JSON.stringify(cache))
}

function readProductListCache(): ProductRow[] {
  if (typeof window === 'undefined') return []
  try {
    const cached = JSON.parse(window.localStorage.getItem(productListCacheKey) || '[]')
    if (!Array.isArray(cached)) return []
    return cached.map(row => ({
      id: row.id,
      name: row.name || '',
      product_code: row.product_code || '',
      cost_price: row.cost_price ?? null,
      image_url: row.image_url ?? null,
      opening_qty: row.opening_qty ?? null,
      suppliers: row.suppliers ?? null,
    })).filter(row => row.id && row.product_code)
  } catch {
    return []
  }
}

function readStoredOpeningQty() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(productOpeningQtyStorageKey) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function isDuplicateError(error: any) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '23505' || message.includes('duplicate')
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function fetchPaged<T>(queryForRange: (from: number, to: number) => any) {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryForRange(from, from + pageSize - 1)
    if (error) throw error
    const page = (data || []) as T[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

async function loadActiveProducts() {
  const selectAttempts = [
    'id, name, product_code, cost_price, image_url, opening_qty, suppliers(name, company_name)',
    'id, name, product_code, cost_price, image_url, opening_qty',
    'id, name, product_code, cost_price, image_url',
    'id, name, product_code, cost_price',
    'id, name, product_code',
  ]

  let lastError: any = null
  for (const selectColumns of selectAttempts) {
    try {
      const rows = await fetchPaged<any>((from, to) =>
        supabase
          .from('products')
          .select(selectColumns)
          .eq('is_active', true)
          .order('product_code')
          .range(from, to)
      )

      const products = rows.map(row => ({
        id: row.id,
        name: row.name || '',
        product_code: row.product_code || '',
        cost_price: row.cost_price ?? null,
        image_url: row.image_url ?? null,
        opening_qty: row.opening_qty ?? null,
        suppliers: row.suppliers ?? null,
      })) as ProductRow[]

      if (products.length > 0) return products

      const cachedProducts = readProductListCache()
      if (cachedProducts.length > 0) {
        console.warn('Products loaded from local Product List cache because database query returned no visible products')
        return cachedProducts
      }

      return products
    } catch (error) {
      lastError = error
      console.warn(`Products could not be loaded with columns: ${selectColumns}`, error)
    }
  }

  const cachedProducts = readProductListCache()
  if (cachedProducts.length > 0) {
    console.warn('Products loaded from local Product List cache after database query failed', lastError)
    return cachedProducts
  }

  throw lastError
}

export default function Inventory() {
  const { t, formatCurr } = useLang()
  const initialCache = useRef(readInventoryCache())
  const hasShownRows = useRef(false)
  const searchRef = useRef(initialCache.current.search)
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [search, setSearch] = useState(initialCache.current.search)
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>(initialCache.current.statusFilter)
  const [loading, setLoading] = useState(true)
  const [dpEdits, setDpEdits] = useState<Record<string, string>>({})
  const [savingDp, setSavingDp] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    if (!hasShownRows.current) setLoading(true)
    try {
      const [productRows, histRows, purchaseItemRows, receiveRows, saleRows, openingBatchRows] = await Promise.all([
        loadActiveProducts(),
        fetchPaged<any>((from, to) =>
          supabase
            .from('inventory_history')
            .select('product_id, qty_change, change_type')
            .range(from, to)
        ).catch(() => []),
        fetchPaged<any>((from, to) =>
          supabase
            .from('purchase_items')
            .select('id, product_id, qty, received_qty')
            .range(from, to)
        ).catch(() => []),
        fetchPaged<any>((from, to) =>
          supabase
            .from('purchase_receives')
            .select('purchase_item_id, received_qty')
            .range(from, to)
        ).catch(() => []),
        fetchPaged<any>((from, to) =>
          supabase
            .from('sale_items')
            .select('product_id, qty')
            .range(from, to)
        ).catch(() => []),
        fetchPaged<any>((from, to) =>
          supabase
            .from('inventory_batches')
            .select('product_id, received_qty')
            .eq('source_type', 'opening_stock')
            .range(from, to)
        ).catch(() => []),
      ])

    const orderQtyMap: Record<string, number> = {}
    for (const pi of purchaseItemRows || []) orderQtyMap[pi.product_id] = (orderQtyMap[pi.product_id] || 0) + (pi.qty || 0)

    const receiveQtyByPurchaseItem: Record<string, number> = {}
    for (const pr of receiveRows || []) {
      receiveQtyByPurchaseItem[pr.purchase_item_id] = (receiveQtyByPurchaseItem[pr.purchase_item_id] || 0) + Number(pr.received_qty || 0)
    }

    const receivedQtyMap: Record<string, number> = {}
    const upcomingQtyMap: Record<string, number> = {}
    for (const pi of purchaseItemRows || []) {
      const productId = pi.product_id
      if (!productId) continue
      const receivedQty = Math.max(Number(pi.received_qty || 0), receiveQtyByPurchaseItem[pi.id] || 0)
      const pendingQty = Math.max(0, Number(pi.qty || 0) - receivedQty)
      receivedQtyMap[productId] = (receivedQtyMap[productId] || 0) + receivedQty
      upcomingQtyMap[productId] = (upcomingQtyMap[productId] || 0) + pendingQty
    }

    const salesQtyMap: Record<string, number> = {}
    for (const si of saleRows || []) salesQtyMap[si.product_id] = (salesQtyMap[si.product_id] || 0) + (si.qty || 0)

    const openingQtyMap: Record<string, number> = readStoredOpeningQty()
    for (const product of productRows || []) {
      openingQtyMap[product.id] = Number(openingQtyMap[product.id] ?? product.opening_qty ?? 0)
    }
    for (const h of histRows || []) {
      if (h.change_type === 'opening_stock') openingQtyMap[h.product_id] = (openingQtyMap[h.product_id] || 0) + (h.qty_change || 0)
    }
    for (const batch of openingBatchRows || []) {
      openingQtyMap[batch.product_id] = Math.max(
        openingQtyMap[batch.product_id] || 0,
        Number(batch.received_qty || 0)
      )
    }

      const inventoryRows = await fetchPaged<any>((from, to) =>
        supabase
          .from('inventory')
          .select('*')
          .is('branch_id', null)
          .range(from, to)
      ).catch(error => {
        console.warn('Inventory rows could not be loaded', error)
        return []
      })
      // Inventory rows are owned and auto-created by the backend now
      // (product create bootstraps them) - no client-side reconciliation.
      const productById = new Map((productRows || []).map(product => [product.id, product]))
      const activeInventoryRows = (inventoryRows || [])
      .map(inv => ({ ...inv, products: productById.get(inv.product_id) || inv.products }))
      .filter(inv => inv.products)
      const activeInventoryProductIds = new Set(activeInventoryRows.map(inv => inv.product_id))
      const fallbackRows = (productRows || [])
        .filter(product => !activeInventoryProductIds.has(product.id))
        .map(product => ({
          id: `product:${product.id}`,
          product_id: product.id,
          products: product,
          available_qty: Number(openingQtyMap[product.id] || 0),
          upcoming_qty: 0,
          dp_price: product.cost_price || null,
        }))

      const enriched: InventoryRow[] = [...activeInventoryRows, ...fallbackRows].map(inv => {
      const productId = inv.product_id
      const receivedQty = receivedQtyMap[productId] || 0
      const upcomingQty = upcomingQtyMap[productId] || 0
      const salesQty = salesQtyMap[productId] || 0
      const fallbackOpeningQty = Number(inv.available_qty || 0) - receivedQty - upcomingQty + salesQty
      const openingQty = openingQtyMap[productId] ?? fallbackOpeningQty
      const manualDp = Number(inv.dp_price ?? inv.products?.cost_price ?? 0)
      const derivedAvailableQty = openingQty + receivedQty + upcomingQty - salesQty
      const stockQty = derivedAvailableQty

      return {
        ...inv,
        available_qty: stockQty,
        opening_qty: openingQty || inv.available_qty,
        order_qty: orderQtyMap[productId] || 0,
        received_qty: receivedQty,
        sales_qty: salesQty,
        upcoming_qty: upcomingQty,
        fifo_stock_value: stockQty * manualDp,
        fifo_average_dp: manualDp,
      }
    })

      setRows(enriched)
      hasShownRows.current = true
      const initial: Record<string, string> = {}
      for (const r of enriched) initial[r.id] = r.dp_price != null ? String(r.dp_price) : ''
      setDpEdits(initial)
      writeInventoryCache({ search: searchRef.current, statusFilter })
    } catch (error: any) {
      toast.error(error.message || 'ইনভেন্টরি লোড করা যায়নি')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    searchRef.current = search
    writeInventoryCache({ search, statusFilter })
  }, [search, statusFilter])

  async function saveDp(row: InventoryRow) {
    const val = dpEdits[row.id]
    const num = val === '' ? null : Number(val)
    setSavingDp(prev => ({ ...prev, [row.id]: true }))
    try {
      // Updates the inventory row + opening stock batches server-side.
      await setInventoryDpPrice(row.product_id, num)
      toast.success(t('inventory_dpSaved'))
      load()
    } catch (err: any) {
      toast.error(err.message || t('common_error'))
    } finally {
      setSavingDp(prev => ({ ...prev, [row.id]: false }))
    }
  }

  function handleDpChange(row: InventoryRow, value: string) {
    const nextDp = value === '' ? null : Number(value)
    setDpEdits(prev => ({ ...prev, [row.id]: value }))
    setRows(prev => prev.map(r => {
      if (r.id !== row.id) return r
      const dp = nextDp ?? Number(r.products?.cost_price || 0)
      return {
        ...r,
        dp_price: nextDp,
        fifo_average_dp: dp,
        fifo_stock_value: Number(r.available_qty || 0) * dp,
      }
    }))
  }

  function getStatus(row: InventoryRow): InventoryStatus {
    if (Number(row.available_qty || 0) <= 0 && Number(row.upcoming_qty || 0) > 0) return 'upcoming'
    if (Number(row.available_qty || 0) <= 0) return 'out_of_stock'
    return 'available'
  }

  const statusConfig: Record<InventoryStatus, { labelKey: string; cls: string }> = {
    available:    { labelKey: 'inventory_statusAvailable',    cls: 'badge-green whitespace-nowrap' },
    upcoming:     { labelKey: 'inventory_statusUpcoming',     cls: 'bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap' },
    low_stock:    { labelKey: 'inventory_statusLowStock',     cls: 'badge-orange whitespace-nowrap' },
    out_of_stock: { labelKey: 'inventory_statusOutOfStock',   cls: 'badge-red whitespace-nowrap' },
  }

  const filtered = rows.filter(r => {
    const p = r.products
    const matchesSearch = !search || p?.name.toLowerCase().includes(search.toLowerCase()) || (p?.product_code || '').toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || getStatus(r) === statusFilter
    return matchesSearch && matchesStatus
  })

  const totalValue = filtered.reduce((s, r) => {
    return s + Number(r.fifo_stock_value || 0)
  }, 0)

  function downloadCSV() {
    const headers = [
      t('inventory_colCode'), t('inventory_colName'), t('inventory_colSupplier'),
      t('inventory_colOpeningQty'), t('inventory_colOrderQty'), t('inventory_colReceivedQty'),
      t('inventory_colUpcomingQty'), t('inventory_colSalesQty'), t('inventory_colAvailableStock'),
      t('inventory_colDp'), t('inventory_colTotalValue'), t('inventory_colStatus'),
    ]
    const csvRows = filtered.map(r => {
      const dp = r.dp_price != null ? r.dp_price : (r.products?.cost_price || 0)
      const sup = r.products?.suppliers?.company_name || r.products?.suppliers?.name || ''
      const status = t(statusConfig[getStatus(r)].labelKey)
      return [r.products?.product_code || '', r.products?.name || '', sup, r.opening_qty, r.order_qty, r.received_qty, r.upcoming_qty, r.sales_qty, r.available_qty, dp, r.fifo_stock_value || 0, status].map(v => `"${v}"`).join(',')
    })
    const csv = [headers.join(','), ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `inventory_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6">
      <PageHeader
        title={t('inventory_title')}
        subtitle={t('inventory_subtitle')}
        actions={
          <button onClick={downloadCSV} className="btn-secondary flex items-center gap-1.5">
            <Download size={15} /> {t('inventory_csvDownload')}
          </button>
        }
      />

      <div className="card mb-4 flex items-center justify-between py-3 px-5">
        <span className="text-sm text-slate-500">{t('inventory_totalValue')}</span>
        <span className="text-xl font-bold text-brand-green">{formatCurr(totalValue)}</span>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inventory_searchPlaceholder')} className="input pl-9" />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as InventoryStatusFilter)}
          className="input w-44"
          aria-label="Filter by status"
        >
          <option value="all">All</option>
          <option value="available">{t('inventory_statusAvailable')}</option>
          <option value="out_of_stock">{t('inventory_statusOutOfStock')}</option>
          <option value="upcoming">{t('inventory_statusUpcoming')}</option>
        </select>
        <div className="card px-4 py-2 text-sm text-slate-600 min-w-fit">
          {t('inventory_totalCount')}: <strong>{filtered.length}</strong>
        </div>
      </div>

      <div className="card max-h-[calc(100vh-260px)] overflow-auto p-0">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="table-header sticky top-0 z-10">
            <tr>
              <th className="text-left py-2.5 px-3 w-12">#</th>
              <th className="text-left py-2.5 px-3">{t('inventory_colCode')}</th>
              <th className="text-left py-2.5 px-3">{t('inventory_colName')}</th>
              <th className="text-center py-2.5 px-3">{t('inventory_colImage')}</th>
              <th className="text-left py-2.5 px-3">{t('inventory_colSupplier')}</th>
              <th className="text-right py-2.5 px-3">{t('inventory_colOpeningQty')}</th>
              <th className="text-right py-2.5 px-3">{t('inventory_colOrderQty')}</th>
              <th className="text-right py-2.5 px-3">{t('inventory_colReceivedQty')}</th>
              <th className="text-right py-2.5 px-3">{t('inventory_colUpcomingQty')}</th>
              <th className="text-right py-2.5 px-3">{t('inventory_colSalesQty')}</th>
              <th className="text-right py-2.5 px-3">{t('inventory_colAvailableStock')}</th>
              <th className="text-right py-2.5 px-3 min-w-[130px]">{t('inventory_colDp')}</th>
              <th className="text-right py-2.5 px-3">{t('inventory_colTotalValue')}</th>
              <th className="text-center py-2.5 px-3">{t('inventory_colStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => {
              const dp = row.dp_price != null ? row.dp_price : (row.products?.cost_price || 0)
              const totalVal = Number(row.available_qty || 0) * Number(dp || 0)
              const status = getStatus(row)
              const sc = statusConfig[status]
              return (
                <tr key={row.id} className="table-row">
                  <td className="py-2 px-3 text-slate-500">{index + 1}</td>
                  <td className="py-2 px-3 font-mono text-xs text-slate-500">{row.products?.product_code || '—'}</td>
                  <td className="py-2 px-3 font-medium">{row.products?.name}</td>
                  <td className="py-2 px-3 text-center">
                    {row.products?.image_url ? (
                      <img src={row.products.image_url} alt="" className="w-8 h-8 object-cover rounded-md mx-auto" onError={e => (e.target as HTMLImageElement).style.display='none'} />
                    ) : (
                      <div className="w-8 h-8 bg-slate-100 rounded-md flex items-center justify-center mx-auto"><Image size={12} className="text-slate-400" /></div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-500 text-xs">{row.products?.suppliers?.company_name || row.products?.suppliers?.name || '—'}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{row.opening_qty}</td>
                  <td className="py-2 px-3 text-right text-blue-600 font-medium">{row.order_qty}</td>
                  <td className="py-2 px-3 text-right text-brand-green font-medium">{row.received_qty}</td>
                  <td className="py-2 px-3 text-right text-amber-600 font-medium">{row.upcoming_qty}</td>
                  <td className="py-2 px-3 text-right text-red-500 font-medium">{row.sales_qty}</td>
                  <td className="py-2 px-3 text-right font-bold text-brand-green text-base">{row.available_qty}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1 justify-end">
                      <input
                        type="number"
                        min="0"
                        className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-brand-green"
                        value={dpEdits[row.id] ?? ''}
                        placeholder={String(row.products?.cost_price || 0)}
                        onChange={e => handleDpChange(row, e.target.value)}
                        onBlur={() => saveDp(row)}
                        onKeyDown={e => { if (e.key === 'Enter') saveDp(row) }}
                      />
                      {savingDp[row.id] && <span className="w-3 h-3 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-brand-green">{formatCurr(totalVal)}</td>
                  <td className="py-2 px-3 text-center"><span className={sc.cls}>{t(sc.labelKey)}</span></td>
                </tr>
              )
            })}
            {filtered.length === 0 && !loading && <tr><td colSpan={14} className="text-center py-10 text-slate-400">{t('common_noData')}</td></tr>}
            {loading && <tr><td colSpan={14} className="text-center py-10 text-slate-400">{t('common_loading')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
