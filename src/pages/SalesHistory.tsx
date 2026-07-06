import React, { useEffect, useMemo, useState } from 'react'
import { Search, FileText, Package, User, Calendar } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { useLang } from '../context/LanguageContext'
import toast from 'react-hot-toast'

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

export default function SalesHistory() {
  const { formatCurr, formatNum } = useLang()
  const [rows, setRows] = useState<SaleHistoryRow[]>([])
  const [search, setSearch] = useState('')
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
    if (!normalizedSearch) return rows

    return rows.filter(row =>
      row.product_name.toLowerCase().includes(normalizedSearch) ||
      row.product_code.toLowerCase().includes(normalizedSearch)
    )
  }, [normalizedSearch, rows])

  const totalQty = filteredRows.reduce((sum, row) => sum + row.qty, 0)
  const totalAmount = filteredRows.reduce((sum, row) => sum + row.total_amount, 0)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 p-6">
      <PageHeader
        title="Sales History"
        subtitle="Search product-wise sales by date and customer"
      />

      <div className="mb-6 flex flex-shrink-0 flex-wrap gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product name or code..."
            className="input pl-9"
          />
        </div>
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

      <div className="card min-h-0 flex-1 overflow-auto bg-white p-0">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="table-header">
            <tr className="border-b border-slate-100 bg-slate-50/55">
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
            {filteredRows.map((row, index) => (
              <tr key={row.id} className="table-row border-b border-slate-100 hover:bg-slate-50/50">
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
          </tbody>
        </table>
      </div>
    </div>
  )
}
