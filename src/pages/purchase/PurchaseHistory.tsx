import React, { useEffect, useMemo, useState } from 'react'
import { CalendarBlankIcon as Calendar, FileTextIcon as FileText, PackageIcon as Package, MagnifyingGlassIcon as Search, TruckIcon as Truck } from '@phosphor-icons/react'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import { supabase } from '../../lib/supabase'
import { firstAmount, formatDate } from '../../lib/utils'
import { actualDp as actualDpOf, purchaseDeposit } from '../../lib/purchaseAmounts'
import { useLang } from '../../context/LanguageContext'
import toast from 'react-hot-toast'
import { useProgressiveRows } from '../../lib/useProgressiveRows'
import { NoValue } from '../../components/CellValue'

type PurchaseHistoryRow = {
  id: string
  purchase_id: string
  date: string
  supplier_name: string
  product_code: string
  product_name: string
  dp_price: number
  discount_pct: number
  qty: number
  actual_dp: number
  total_amount: number
  discount_amount: number
  deposit_amount: number
  received_qty: number
  shipping_status: string
}

type Period = 'all' | 'month' | 'year' | 'custom'
type SortBy = 'date_desc' | 'date_asc' | 'name_asc' | 'amount_desc' | 'amount_asc'

export default function PurchaseHistory() {
  const { formatCurr, formatNum } = useLang()
  const [rows, setRows] = useState<PurchaseHistoryRow[]>([])
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [sortBy, setSortBy] = useState<SortBy>('date_desc')
  const [companyFilter, setCompanyFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('purchases')
        .select('id, date, supplier_name, shipping_status, purchase_items(*, purchase_receives(*))')
        .order('date', { ascending: false })
        .limit(500)

      if (error) throw error

      const nextRows = (data || []).flatMap((purchase: any) =>
        (purchase.purchase_items || []).map((item: any) => {
          const dpPrice = Number(item.dp_price || 0)
          const discountPct = Number(item.discount_pct || 0)
          const qty = Number(item.qty || 0)
          const actualDp = firstAmount(item.actual_dp, actualDpOf(dpPrice, discountPct))
          const totalAmount = Number(item.total_amount || actualDp * qty)
          const spAmount = Number(item.sp_amount || 0)
          const receivedQtyFromHistory = (item.purchase_receives || []).reduce(
            (sum: number, receive: any) => sum + Number(receive.received_qty || 0),
            0
          )

          return {
            id: item.id,
            purchase_id: purchase.id,
            date: purchase.date,
            supplier_name: purchase.supplier_name || '-',
            product_code: item.product_code || '',
            product_name: item.product_name || '-',
            dp_price: dpPrice,
            discount_pct: discountPct,
            qty,
            actual_dp: actualDp,
            total_amount: totalAmount,
            discount_amount: (dpPrice * discountPct / 100) * qty,
            deposit_amount: purchaseDeposit(totalAmount, spAmount),
            received_qty: receivedQtyFromHistory || Number(item.received_qty || 0),
            shipping_status: purchase.shipping_status || 'pending',
          }
        })
      )

      setRows(nextRows)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load purchase history')
    } finally {
      setLoading(false)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  // Only the companies that actually appear, so the filter never offers a
  // choice that returns nothing.
  const companies = useMemo(() => {
    const names = new Set<string>()
    rows.forEach(row => { if (row.supplier_name && row.supplier_name !== '-') names.add(row.supplier_name) })
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filteredRows = useMemo(() => {
    const now = new Date()
    const from = fromDate ? new Date(fromDate + 'T00:00:00') : null
    const to = toDate ? new Date(toDate + 'T23:59:59') : null

    const inPeriod = (dateStr: string) => {
      if (period === 'all') return true
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return true
      if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      if (period === 'year') return d.getFullYear() === now.getFullYear()
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    }

    const result = rows.filter(row => {
      const matchesSearch = !normalizedSearch ||
        row.product_name.toLowerCase().includes(normalizedSearch) ||
        row.product_code.toLowerCase().includes(normalizedSearch) ||
        row.supplier_name.toLowerCase().includes(normalizedSearch)
      const matchesCompany = !companyFilter || row.supplier_name === companyFilter
      return matchesSearch && matchesCompany && inPeriod(row.date)
    })

    const sorted = [...result]
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc': return new Date(a.date).getTime() - new Date(b.date).getTime()
        case 'name_asc': return a.supplier_name.localeCompare(b.supplier_name)
        case 'amount_desc': return b.total_amount - a.total_amount
        case 'amount_asc': return a.total_amount - b.total_amount
        case 'date_desc':
        default: return new Date(b.date).getTime() - new Date(a.date).getTime()
      }
    })
    return sorted
  }, [normalizedSearch, rows, period, sortBy, fromDate, toDate, companyFilter])

  // Draws a slice at a time as the reader scrolls. Every row stays in
  // memory, so totals, filters and exports above are untouched.
  const shown = useProgressiveRows(filteredRows, { initial: 40, step: 40 })

  const totalQty = filteredRows.reduce((sum, row) => sum + row.qty, 0)
  const totalReceived = filteredRows.reduce((sum, row) => sum + row.received_qty, 0)
  const totalAmount = filteredRows.reduce((sum, row) => sum + row.total_amount, 0)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white p-6">
      <PageHeader
        title="Purchase History"
        subtitle="Search product-wise purchases by date and supplier"
      />

      <div className="mb-6 flex flex-shrink-0 flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product or supplier..."
            className="input pl-9"
          />
        </div>
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="input min-w-[150px] max-w-[190px]" title="Company">
          <option value="">All Company</option>
          {companies.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="input min-w-[130px] max-w-[160px]" title="Period">
          <option value="all">All Time</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="custom">Custom Range</option>
        </select>
        {period === 'custom' && (
          <>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input min-w-[140px] max-w-[170px]" title="From date" />
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input min-w-[140px] max-w-[170px]" title="To date" />
          </>
        )}
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className="input min-w-[150px] max-w-[190px]" title="Sort by">
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="name_asc">Supplier (A-Z)</option>
          <option value="amount_desc">Amount (high-low)</option>
          <option value="amount_asc">Amount (low-high)</option>
        </select>
        <div className="card flex min-w-fit items-center gap-2 border border-slate-100 bg-white px-4 py-2 text-sm shadow-sm">
          <Package size={15} className="text-slate-400" />
          <span className="text-slate-500">Qty:</span>
          <strong className="text-slate-800">{formatNum(totalQty)}</strong>
        </div>
        <div className="card flex min-w-fit items-center gap-2 border border-slate-100 bg-white px-4 py-2 text-sm shadow-sm">
          <Truck size={15} className="text-slate-400" />
          <span className="text-slate-500">Received:</span>
          <strong className="text-brand-green">{formatNum(totalReceived)}</strong>
        </div>
        <div className="card flex min-w-fit items-center gap-2 border border-slate-100 bg-white px-4 py-2 text-sm shadow-sm">
          <FileText size={15} className="text-slate-400" />
          <span className="text-slate-500">Total:</span>
          <strong className="text-brand-green">{formatCurr(totalAmount)}</strong>
        </div>
      </div>

      <div className="card min-h-0 flex-1 flex flex-col bg-white p-0">
        <TableScroller wrapClassName="flex min-h-0 flex-1 flex-col" className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1680px] text-sm">
          <thead className="table-header">
            <tr className="border-b border-slate-100 bg-white/55">
              <th className="text-left py-3 px-4">#</th>
              <th className="text-left py-3 px-4">Company</th>
              <th className="text-left py-3 px-4">Date</th>
              <th className="text-left py-3 px-4">Product Code</th>
              <th className="text-left py-3 px-4">Product Name</th>
              <th className="text-right py-3 px-4">DP Price</th>
              <th className="text-right py-3 px-4">Discount %</th>
              <th className="text-right py-3 px-4">Actual DP</th>
              <th className="text-right py-3 px-4">QTY</th>
              <th className="text-right py-3 px-4">Total Amount</th>
              <th className="text-right py-3 px-4">Discount Amount</th>
              <th className="text-right py-3 px-4">Actual Deposit</th>
              <th className="text-right py-3 px-4">Received</th>
              <th className="text-right py-3 px-4">Pending</th>
              <th className="text-center py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.visible.map((row, index) => {
              const pendingQty = Math.max(0, row.qty - row.received_qty)
              const status = pendingQty <= 0 ? 'received' : pendingQty > 0 && row.shipping_status === 'partial' ? 'partial' : 'pending'

              return (
                <tr key={row.id} className="table-row border-b border-slate-100 hover:bg-white/50">
                  <td className="py-3 px-4 text-slate-400">{index + 1}</td>
                  <td className="py-3 px-4 font-medium text-slate-700">{row.supplier_name}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={13} className="text-slate-400" />
                      {formatDate(row.date)}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-500">{row.product_code || <NoValue />}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{row.product_name}</td>
                  <td className="py-3 px-4 text-right text-slate-600">{formatCurr(row.dp_price)}</td>
                  <td className="py-3 px-4 text-right text-brand-red">{formatNum(row.discount_pct)}%</td>
                  <td className="py-3 px-4 text-right text-slate-600">{formatCurr(row.actual_dp)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700">{formatNum(row.qty)}</td>
                  <td className="py-3 px-4 text-right font-bold text-slate-800">{formatCurr(row.total_amount)}</td>
                  <td className="py-3 px-4 text-right text-brand-red">{formatCurr(row.discount_amount)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-brand-green">{formatCurr(row.deposit_amount)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-brand-green">{formatNum(row.received_qty)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-brand-orange">{formatNum(pendingQty)}</td>
                  {/* Amber is the app's "still waiting" colour: the brand palette
                      says so and .badge-orange compiles to it. This was the last
                      Pending badge left on Info blue. */}
                  <td className="py-3 px-4 text-center">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${
                      status === 'received'
                        ? 'bg-green-100 text-green-700'
                        : status === 'partial'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-brand-orange-soft text-brand-orange'
                    }`}>
                      {status === 'received' ? 'Received' : status === 'partial' ? 'Partial' : 'Pending'}
                    </span>
                  </td>
                </tr>
              )
            })}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={15} className="py-10 text-center text-slate-400">
                  No purchase history found
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={15} className="py-10 text-center text-slate-400">
                  Loading purchase history...
                </td>
              </tr>
            )}
          {/* Draws the next slice 600px before the reader reaches the end.
              Every row is already loaded - this only limits how many the
              browser lays out at once, so no total or filter is affected. */}
          {shown.hasMore && (
            <tr ref={shown.sentinelRef as unknown as React.Ref<HTMLTableRowElement>}>
              <td colSpan={15} className="py-4 text-center text-sm text-slate-400">
                {shown.visibleCount.toLocaleString()} of {shown.total.toLocaleString()} shown
              </td>
            </tr>
          )}
          </tbody>
        </table>
        </TableScroller>
      </div>
    </div>
  )
}
