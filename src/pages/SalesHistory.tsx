import React, { useEffect, useMemo, useState } from 'react'
import TableScroller from '../components/TableScroller'
import { MagnifyingGlassIcon as Search, FileTextIcon as FileText, PackageIcon as Package, UserIcon as User, CalendarBlankIcon as Calendar } from '@phosphor-icons/react'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { useLang } from '../context/LanguageContext'
import toast from 'react-hot-toast'
import { useProgressiveRows } from '../lib/useProgressiveRows'

type SaleHistoryRow = {
  id: string
  sale_id: string
  invoice_no: string
  date: string
  customer_name: string
  customer_phone: string
  product_code: string
  product_name: string
  qty: number
  actual_price: number
  total_amount: number
}

type Period = 'all' | 'month' | 'year' | 'custom'
type SortBy = 'date_desc' | 'date_asc' | 'name_asc' | 'amount_desc' | 'amount_asc'

export default function SalesHistory() {
  const { formatCurr, formatNum } = useLang()
  const [rows, setRows] = useState<SaleHistoryRow[]>([])
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [sortBy, setSortBy] = useState<SortBy>('date_desc')
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
        .from('sales')
        .select('id, invoice_no, date, customer_name, customer_phone, sale_items(*)')
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(500)

      if (error) throw error

      const nextRows = (data || []).flatMap((sale: any) =>
        (sale.sale_items || []).map((item: any) => ({
          id: item.id,
          sale_id: sale.id,
          invoice_no: sale.invoice_no || '-',
          date: sale.date,
          customer_name: sale.customer_name || '-',
          customer_phone: sale.customer_phone || '-',
          product_code: item.product_code || '',
          product_name: item.product_name || '-',
          qty: Number(item.qty || 0),
          actual_price: Number(item.actual_price || 0),
          total_amount: Number(item.total_amount || 0),
        }))
      )

      setRows(nextRows)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load sales history')
    } finally {
      setLoading(false)
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
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
      // custom range - open-ended if only one bound is set
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    }

    const result = rows.filter(row => {
      const matchesSearch = !normalizedSearch ||
        row.product_name.toLowerCase().includes(normalizedSearch) ||
        row.product_code.toLowerCase().includes(normalizedSearch) ||
        row.customer_name.toLowerCase().includes(normalizedSearch)
      return matchesSearch && inPeriod(row.date)
    })

    const sorted = [...result]
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc': return new Date(a.date).getTime() - new Date(b.date).getTime()
        case 'name_asc': return a.customer_name.localeCompare(b.customer_name)
        case 'amount_desc': return b.total_amount - a.total_amount
        case 'amount_asc': return a.total_amount - b.total_amount
        case 'date_desc':
        default: return new Date(b.date).getTime() - new Date(a.date).getTime()
      }
    })
    return sorted
  }, [normalizedSearch, rows, period, sortBy, fromDate, toDate])

  // Draws a slice at a time as the reader scrolls. Every row stays in
  // memory, so totals, filters and exports above are untouched.
  const shown = useProgressiveRows(filteredRows, { initial: 40, step: 40 })

  const totalQty = filteredRows.reduce((sum, row) => sum + row.qty, 0)
  const totalAmount = filteredRows.reduce((sum, row) => sum + row.total_amount, 0)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white p-6">
      <PageHeader
        title="Sales History"
        subtitle="Search product-wise sales by date and customer"
      />

      <div className="mb-6 flex flex-shrink-0 flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product or customer..."
            className="input pl-9"
          />
        </div>
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
          <option value="name_asc">Customer (A-Z)</option>
          <option value="amount_desc">Amount (high-low)</option>
          <option value="amount_asc">Amount (low-high)</option>
        </select>
        <div className="card flex min-w-fit items-center gap-2 border border-slate-100 bg-white px-4 py-2 text-sm shadow-sm">
          <Package size={15} className="text-slate-400" />
          <span className="text-slate-500">Qty:</span>
          <strong className="text-slate-800">{formatNum(totalQty)}</strong>
        </div>
        <div className="card flex min-w-fit items-center gap-2 border border-slate-100 bg-white px-4 py-2 text-sm shadow-sm">
          <FileText size={15} className="text-slate-400" />
          <span className="text-slate-500">Total:</span>
          <strong className="text-brand-green">{formatCurr(totalAmount)}</strong>
        </div>
      </div>

      <TableScroller wrapClassName="card min-h-0 flex-1 flex flex-col bg-white p-0" className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="table-header">
            <tr className="border-b border-slate-100 bg-white/55">
              <th className="w-12 px-4 py-3 text-left">#</th>
              <th className="text-left py-3 px-4">Date</th>
              <th className="text-left py-3 px-4">Product</th>
              <th className="text-left py-3 px-4">Customer</th>
              <th className="text-left py-3 px-4">Phone</th>
              <th className="text-left py-3 px-4">Invoice</th>
              <th className="text-right py-3 px-4">Qty</th>
              <th className="text-right py-3 px-4">Rate</th>
              <th className="text-right py-3 px-4">Total</th>
            </tr>
          </thead>
          <tbody>
            {shown.visible.map((row, index) => (
              <tr key={row.id} className="table-row border-b border-slate-100 hover:bg-white/50">
                <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    {formatDate(row.date)}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <p className="font-semibold text-slate-800">{row.product_name}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{row.product_code || '-'}</p>
                </td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                    <User size={13} className="text-slate-400" />
                    {row.customer_name}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-500">{row.customer_phone}</td>
                <td className="py-3 px-4 font-mono text-xs">{row.invoice_no}</td>
                <td className="py-3 px-4 text-right font-semibold text-slate-700">{formatNum(row.qty)}</td>
                <td className="py-3 px-4 text-right text-slate-600">{formatCurr(row.actual_price)}</td>
                <td className="py-3 px-4 text-right font-bold text-slate-800">{formatCurr(row.total_amount)}</td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-400">
                  No sales history found
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-400">
                  Loading sales history...
                </td>
              </tr>
            )}
          {/* Draws the next slice 600px before the reader reaches the end.
              Every row is already loaded - this only limits how many the
              browser lays out at once, so no total or filter is affected. */}
          {shown.hasMore && (
            <tr ref={shown.sentinelRef as unknown as React.Ref<HTMLTableRowElement>}>
              <td colSpan={12} className="py-4 text-center text-sm text-slate-400">
                {shown.visibleCount.toLocaleString()} of {shown.total.toLocaleString()} shown
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </TableScroller>
    </div>
  )
}
