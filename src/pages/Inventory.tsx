import React, { useState, useEffect, useCallback, useRef } from 'react'
import { MagnifyingGlassIcon as Search, DownloadSimpleIcon as Download, ImageIcon as Image, PrinterIcon as Printer, WarningIcon as Warning, XIcon as X } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'
import { printTable } from '../lib/printTable'
import TableScroller from '../components/TableScroller'
import { adjustInventory, getInventoryHistory, getInventoryPage } from '../services/product.services'
import { usePagedList } from '../lib/usePagedList'
import TableSkeleton from '../components/TableSkeleton'
import PageHeader from '../components/PageHeader'
import { useLang } from '../context/LanguageContext'
import toast from 'react-hot-toast'
import { NoValue } from '../components/CellValue'
import Modal from '../components/Modal'
import { amountClass, formatDate } from '../lib/utils'

type InventoryRow = {
  id: string; product_id: string; available_qty: number; upcoming_qty: number; dp_price: number | null
  products: ProductRow
  opening_qty: number; order_qty: number; received_qty: number; sales_qty: number
  /**
   * What opening + received - sold comes to, beside available_qty (which is the
   * stock ledger, the same figure the Sales page reads). They differ by exactly
   * the manual adjustments, so a gap here is a real movement, not a bug.
   */
  computed_qty: number
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

// The API layer returns whole tables and applies .range() in the browser, so
// walking it page by page downloaded the entire table again for every page.
// Inventory reads six tables, so that cost was multiplied six times over.
async function fetchAllRows<T>(query: (from: number, to: number) => any) {
  const { data, error } = await query(0, Number.MAX_SAFE_INTEGER)
  if (error) throw error
  return (data || []) as T[]
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
      const rows = await fetchAllRows<any>((from, to) =>
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

      // A successful fetch is authoritative, even when it comes back empty:
      // that is exactly what the server sends once every product has been
      // deleted. Treating "no rows" as a failed query and substituting the
      // local cache is what kept deleted products listed in Inventory long
      // after the Product List had correctly emptied. A real failure throws
      // and is handled below, where the cache still makes sense.
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
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>(initialCache.current.statusFilter)
  // Read inside the loader, which is deliberately not rebuilt when the filter
  // changes - the effect below reloads instead, so a change cannot leave a
  // half-filtered page appended to a fully-filtered one.
  const statusFilterRef = useRef(statusFilter)
  statusFilterRef.current = statusFilter
  // Every matching row, from the server. A total that only added up the rows
  // scrolled into view would be worse than showing none.
  const [totalStockValue, setTotalStockValue] = useState(0)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  // Manual stock correction: damage, loss, or a physical count that disagrees
  // with the system. qtyChange is signed - what to ADD, so a loss is negative.
  const [adjustRow, setAdjustRow] = useState<InventoryRow | null>(null)
  const [adjustForm, setAdjustForm] = useState({ qty_change: '', notes: '' })
  const [adjusting, setAdjusting] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // One request, already computed and paged. This used to fetch products,
  // inventory, inventory_history, purchase_items, purchase_receives,
  // sale_items and inventory_batches in full and join them by hand - six
  // tables and megabytes of rows to show forty. The arithmetic moved to SQL
  // unchanged; see getInventoryList in the backend service.
  const paged = usePagedList<InventoryRow>(
    useCallback(async ({ page, limit, search: term }) => {
      const result = await getInventoryPage({ page, limit, search: term, status: statusFilterRef.current })
      setTotalStockValue(result.totalStockValue)
      return { rows: result.rows as InventoryRow[], total: result.total }
    }, []),
    { limit: 40 }
  )



  // The server applied both the search and the status filter, so these are the
  // matching rows loaded so far. Filtering again here would only risk the two
  // rules drifting apart.
  const rows = paged.items
  const filtered = rows
  const search = paged.search
  const setSearch = paged.setSearch
  const loading = paged.loading
  const totalValue = totalStockValue
  // Whether to explain the total, not how many lines to blame.
  //
  // A count off the loaded rows cannot be stated: totalValue is computed over
  // every matching row on the server while these are one page of forty, so on a
  // large catalogue the oversold products routinely sort onto a page nobody has
  // scrolled to - the negative total would render with no explanation at all,
  // and the number would keep changing as pages loaded. A negative total is
  // itself proof that something is oversold, so that is what asks the question;
  // a negative row in view asks it too, even when the total is still positive.
  const oversoldInView = rows.some((row: any) => Number(row.available_qty || 0) < 0)
  const showOversoldNote = totalValue < 0 || oversoldInView

  useEffect(() => {
    searchRef.current = search
    writeInventoryCache({ search, statusFilter })
  }, [search, statusFilter])

  // A changed status filter has to start again from page one; appending a
  // differently-filtered page to the current list would mix the two.
  const firstStatusRender = useRef(true)
  useEffect(() => {
    if (firstStatusRender.current) { firstStatusRender.current = false; return }
    paged.reload()
  }, [statusFilter])

  async function openAdjust(row: InventoryRow) {
    setAdjustRow(row)
    setAdjustForm({ qty_change: '', notes: '' })

    // Every movement this product has had, from inventory_history - which the
    // server has always written and nothing has ever shown. It answers the
    // question the adjust box raises ("why is this number what it is?") right
    // where it is asked, rather than on a separate screen nobody would open.
    setHistory([])
    setHistoryLoading(true)
    try {
      setHistory(await getInventoryHistory(row.product_id))
    } catch {
      // The adjustment itself must still work if the history cannot be read.
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function saveAdjust() {
    if (!adjustRow) return
    const change = Number(adjustForm.qty_change)
    if (!Number.isFinite(change) || change === 0) {
      return toast.error(t('inventory_adjustNeedQty', 'Enter how many to add or remove'))
    }
    if (!Number.isInteger(change)) {
      return toast.error(t('inventory_adjustWholeOnly', 'Stock moves in whole units'))
    }

    setAdjusting(true)
    try {
      // The server writes the level, the history row and the FIFO batches in one
      // transaction: an increase lays down a new batch at the product's cost, a
      // decrease consumes the oldest ones - so the stock value stays honest
      // instead of drifting away from what the goods cost.
      await adjustInventory({
        product_id: adjustRow.product_id,
        product_name: adjustRow.products?.name || '',
        qty_change: change,
        notes: adjustForm.notes.trim() || 'Manual adjustment',
      })
      toast.success(t('inventory_adjustSaved', 'Stock adjusted'))
      setAdjustRow(null)
      paged.reload()
    } catch (error: any) {
      toast.error(error?.message || t('common_error'))
    } finally {
      setAdjusting(false)
    }
  }

  function getStatus(row: InventoryRow): InventoryStatus {
    if (Number(row.available_qty || 0) <= 0 && Number(row.upcoming_qty || 0) > 0) return 'upcoming'
    if (Number(row.available_qty || 0) <= 0) return 'out_of_stock'
    return 'available'
  }

  const statusConfig: Record<InventoryStatus, { labelKey: string; cls: string }> = {
    available:    { labelKey: 'inventory_statusAvailable',    cls: 'badge-green whitespace-nowrap' },
    upcoming:     { labelKey: 'inventory_statusUpcoming',     cls: 'bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap' },
    low_stock:    { labelKey: 'inventory_statusLowStock',     cls: 'badge-orange whitespace-nowrap' },
    out_of_stock: { labelKey: 'inventory_statusOutOfStock',   cls: 'badge-red whitespace-nowrap' },
  }



  function downloadCSV() {
    const headers = [
      t('inventory_colCode'), t('inventory_colName'), t('inventory_colSupplier'),
      t('inventory_colOpeningQty'), t('inventory_colOrderQty'), t('inventory_colReceivedQty'),
      t('inventory_colUpcomingQty'), t('inventory_colAvailableStock'),
      t('inventory_colDp'), t('inventory_colTotalValue'), t('inventory_colStatus'),
    ]
    const csvRows = filtered.map(r => {
      const dp = r.dp_price != null ? r.dp_price : (r.products?.cost_price || 0)
      const sup = r.products?.suppliers?.company_name || r.products?.suppliers?.name || ''
      const status = t(statusConfig[getStatus(r)].labelKey)
      return [r.products?.product_code || '', r.products?.name || '', sup, r.opening_qty, r.order_qty, r.received_qty, r.upcoming_qty, r.available_qty, dp, r.fifo_stock_value || 0, status].map(v => `"${v}"`).join(',')
    })
    const csv = [headers.join(','), ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `inventory_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Same columns and rows as the CSV, rendered through the shared print sheet.
  function handlePrint() {
    printTable({
      title: t('inventory_title'),
      subtitle: `${t('inventory_totalValue')}: ${formatCurr(totalValue)}`,
      columns: [
        { label: '#' },
        { label: t('inventory_colCode') },
        { label: t('inventory_colName') },
        { label: t('inventory_colSupplier') },
        { label: t('inventory_colOpeningQty'), align: 'right' },
        { label: t('inventory_colOrderQty'), align: 'right' },
        { label: t('inventory_colReceivedQty'), align: 'right' },
        { label: t('inventory_colUpcomingQty'), align: 'right' },
        { label: t('inventory_colAvailableStock'), align: 'right' },
        { label: t('inventory_colDp'), align: 'right' },
        { label: t('inventory_colTotalValue'), align: 'right' },
        { label: t('inventory_colStatus') },
      ],
      rows: filtered.map((r, i) => {
        const dp = r.dp_price != null ? r.dp_price : (r.products?.cost_price || 0)
        const sup = r.products?.suppliers?.company_name || r.products?.suppliers?.name || ''
        return [
          i + 1,
          r.products?.product_code || '',
          r.products?.name || '',
          sup,
          r.opening_qty, r.order_qty, r.received_qty, r.upcoming_qty, r.available_qty,
          formatCurr(Number(dp || 0)),
          formatCurr(Number(r.fifo_stock_value || 0)),
          t(statusConfig[getStatus(r)].labelKey),
        ]
      }),
    })
  }

  return (
    <div className="p-6">
      <PageHeader
        title={t('inventory_title')}
        subtitle={t('inventory_subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-1.5">
              <Printer size={15} /> Print
            </button>
            <button onClick={downloadCSV} className="btn-secondary flex items-center gap-1.5">
              <Download size={15} /> {t('inventory_csvDownload')}
            </button>
          </div>
        }
      />

      {/* A stock value can only go negative because more of something has been
          sold than was ever recorded as bought. Shown on its own that reads as
          the business owing seven crore of furniture; the line beneath says
          what it actually means and how many products are behind it. */}
      <div className="card mb-4 py-3 px-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">{t('inventory_totalValue')}</span>
          <span className={`text-xl font-bold ${totalValue < 0 ? 'text-brand-red' : 'text-brand-green'}`}>{formatCurr(totalValue)}</span>
        </div>
        {showOversoldNote && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-brand-red">
            <Warning size={14} weight="duotone" className="mt-px shrink-0" />
            <span>{t('inventory_oversoldNote')}</span>
          </p>
        )}
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

      <div className="card p-0">
        <TableScroller className="max-h-[calc(100vh-260px)] overflow-auto">
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
                  <td className="py-2 px-3 font-mono text-xs text-slate-500">{row.products?.product_code || <NoValue />}</td>
                  <td className="py-2 px-3 font-medium">{row.products?.name}</td>
                  <td className="py-2 px-3 text-center">
                    {row.products?.image_url ? (
                      <img
                        src={row.products.image_url}
                        alt=""
                        // Same reason as the Product List: one thumbnail per
                        // row, thousands of rows, all fetched at once unless
                        // the browser is told to wait until they are in view.
                        loading="lazy"
                        decoding="async"
                        className="w-8 h-8 object-cover rounded-md mx-auto cursor-zoom-in transition hover:ring-2 hover:ring-slate-300"
                        onClick={() => setLightboxImage(row.products.image_url)}
                        onError={e => (e.target as HTMLImageElement).style.display='none'}
                      />
                    ) : (
                      <div className="w-8 h-8 bg-slate-100 rounded-md flex items-center justify-center mx-auto"><Image size={12} className="text-slate-400" /></div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-500 text-xs">{row.products?.suppliers?.company_name || row.products?.suppliers?.name || <NoValue />}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{row.opening_qty}</td>
                  <td className="py-2 px-3 text-right text-slate-700 font-medium">{row.order_qty}</td>
                  <td className="py-2 px-3 text-right text-brand-green font-medium">{row.received_qty}</td>
                  <td className="py-2 px-3 text-right text-brand-blue font-medium">{row.upcoming_qty}</td>
                  {/* The stock figure itself opens the adjustment box.
                      There was no way at all to record "five chairs were damaged"
                      - POST /inventory/adjust existed, kept FIFO in step, and had
                      no control anywhere in the app. A new column would have cost
                      width this table does not have, so the number that is being
                      corrected is the thing you click. */}
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => openAdjust(row)}
                      title={t('inventory_adjustHint', 'Adjust this stock (damage, loss, stock count)')}
                      className="rounded px-1 text-base font-bold text-brand-green underline decoration-dotted underline-offset-4 hover:bg-emerald-50"
                    >
                      {row.available_qty}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-slate-700">{formatCurr(dp)}</td>
                  <td className="py-2 px-3 text-right font-medium text-brand-green">{formatCurr(totalVal)}</td>
                  <td className="py-2 px-3 text-center"><span className={sc.cls}>{t(sc.labelKey)}</span></td>
                </tr>
              )
            })}
            {filtered.length === 0 && !loading && <tr><td colSpan={13} className="text-center py-10 text-slate-400">{t('common_noData')}</td></tr>}
            {/* Skeleton rows rather than a "loading" line, so the table is
                seen filling in. */}
            {loading && <TableSkeleton rows={10} cols={14} />}
            {/* Loads the next page 600px before the reader reaches the end. */}
            {paged.hasMore && !loading && (
              <tr ref={paged.sentinelRef as unknown as React.Ref<HTMLTableRowElement>}>
                <td colSpan={13} className="py-4 text-center text-sm text-slate-400">
                  {paged.loadingMore
                    ? `Loading more… ${rows.length.toLocaleString()} of ${paged.total.toLocaleString()}`
                    : `${rows.length.toLocaleString()} of ${paged.total.toLocaleString()} loaded`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </TableScroller>
      </div>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt="Product preview"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Close preview"
          >
            <X size={22} />
          </button>
        </div>
      )}

      {/* Manual stock correction. Signed, because "adjust" is a movement, not a
          new total: typing -5 records that five left, which is what the history
          row and the FIFO consumption both need. Setting an absolute figure
          would hide whether stock was lost or found. */}
      <Modal
        isOpen={Boolean(adjustRow)}
        onClose={() => setAdjustRow(null)}
        title={t('inventory_adjustTitle', 'Adjust stock')}
        size="sm"
      >
        {adjustRow && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-800">{adjustRow.products?.name}</p>
              <p className="text-xs text-slate-500">
                {adjustRow.products?.product_code} · {t('inventory_colAvailableStock')}: <span className="font-bold text-brand-green">{adjustRow.available_qty}</span>
              </p>
            </div>

            <div>
              <label className="label" htmlFor="adjust-qty">
                {t('inventory_adjustQty', 'Add (+) or remove (-)')}
              </label>
              <input
                id="adjust-qty"
                type="number"
                step="1"
                autoFocus
                className="input"
                placeholder="-5"
                value={adjustForm.qty_change}
                onChange={e => setAdjustForm(current => ({ ...current, qty_change: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') saveAdjust() }}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {t('inventory_adjustExample', 'Five chairs damaged: type -5. Five found in a stock count: type 5.')}
              </p>
              {Number(adjustForm.qty_change) !== 0 && Number.isFinite(Number(adjustForm.qty_change)) && (
                <p className="mt-1.5 text-xs font-semibold text-slate-700">
                  {adjustRow.available_qty} → <span className={amountClass(adjustRow.available_qty + Number(adjustForm.qty_change), 'text-brand-green')}>
                    {adjustRow.available_qty + Number(adjustForm.qty_change)}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="adjust-notes">{t('common_notes', 'Reason')}</label>
              <input
                id="adjust-notes"
                className="input"
                placeholder={t('inventory_adjustReason', 'Damaged in transit')}
                value={adjustForm.notes}
                onChange={e => setAdjustForm(current => ({ ...current, notes: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') saveAdjust() }}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setAdjustRow(null)} className="btn-secondary flex-1 justify-center">
                {t('common_cancel')}
              </button>
              <button onClick={saveAdjust} disabled={adjusting} className="btn-primary flex-1 justify-center disabled:opacity-60">
                {adjusting ? t('common_saving') : t('common_save')}
              </button>
            </div>

            {/* Every movement this product has had. The server has always written
                inventory_history and nothing has ever shown it, so "why is this
                number what it is?" had no answer anywhere in the app. It belongs
                here rather than on a screen of its own, because here is where the
                question gets asked. */}
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {t('inventory_history', 'Stock history')}
              </p>
              {historyLoading ? (
                <p className="py-3 text-center text-xs text-slate-400">{t('common_loading', 'Loading...')}</p>
              ) : history.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-400">{t('inventory_noHistory', 'No movements recorded yet')}</p>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {history.map((entry: any) => (
                    <div key={entry.id} className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-700">
                          {entry.notes || entry.reference_type || entry.change_type}
                        </p>
                        <p className="text-[11px] text-slate-400">{formatDate(entry.created_at)}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-bold ${Number(entry.qty_change) < 0 ? 'text-brand-red' : 'text-brand-green'}`}>
                        {Number(entry.qty_change) > 0 ? '+' : ''}{entry.qty_change}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
