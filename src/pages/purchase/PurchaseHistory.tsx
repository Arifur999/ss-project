import React, { useEffect, useMemo, useState } from 'react'
import { Calendar, FileText, Package, Search, Truck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { useLang } from '../../context/LanguageContext'
import toast from 'react-hot-toast'

type PurchaseHistoryRow = {
  id: string
  purchase_id: string
  si_no: string
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

export default function PurchaseHistory() {
  const { formatCurr, formatNum } = useLang()
  const [rows, setRows] = useState<PurchaseHistoryRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('purchases')
        .select('id, si_no, date, supplier_name, shipping_status, purchase_items(*, purchase_receives(*))')
        .order('date', { ascending: false })
        .limit(500)

      if (error) throw error

      const nextRows = (data || []).flatMap((purchase: any) =>
        (purchase.purchase_items || []).map((item: any) => {
          const dpPrice = Number(item.dp_price || 0)
          const discountPct = Number(item.discount_pct || 0)
          const qty = Number(item.qty || 0)
          const actualDp = Number(item.actual_dp || dpPrice * (1 - discountPct / 100))
          const totalAmount = Number(item.total_amount || actualDp * qty)
          const spAmount = Number(item.sp_amount || 0)
          const receivedQtyFromHistory = (item.purchase_receives || []).reduce(
            (sum: number, receive: any) => sum + Number(receive.received_qty || 0),
            0
          )

          return {
            id: item.id,
            purchase_id: purchase.id,
            si_no: purchase.si_no || '-',
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
            deposit_amount: Number(item.deposit_amount || 0) || Math.max(0, totalAmount - spAmount),
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
  const filteredRows = useMemo(() => {
    if (!normalizedSearch) return rows

    return rows.filter(row =>
      row.product_name.toLowerCase().includes(normalizedSearch) ||
      row.product_code.toLowerCase().includes(normalizedSearch)
    )
  }, [normalizedSearch, rows])

  const totalQty = filteredRows.reduce((sum, row) => sum + row.qty, 0)
  const totalReceived = filteredRows.reduce((sum, row) => sum + row.received_qty, 0)
  const totalAmount = filteredRows.reduce((sum, row) => sum + row.total_amount, 0)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 p-6">
      <PageHeader
        title="Purchase History"
        subtitle="Search product-wise purchases by date and supplier"
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

      <div className="card min-h-0 flex-1 overflow-auto bg-white p-0">
        <table className="w-full min-w-[1680px] text-sm">
          <thead className="table-header">
            <tr className="border-b border-slate-100 bg-slate-50/55">
              <th className="text-left py-3 px-4">#</th>
              <th className="text-left py-3 px-4">SI No</th>
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
            {filteredRows.map((row, index) => {
              const pendingQty = Math.max(0, row.qty - row.received_qty)
              const status = pendingQty <= 0 ? 'received' : pendingQty > 0 && row.shipping_status === 'partial' ? 'partial' : 'pending'

              return (
                <tr key={row.id} className="table-row border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-3 px-4 text-slate-400">{index + 1}</td>
                  <td className="py-3 px-4 font-mono text-xs">{row.si_no}</td>
                  <td className="py-3 px-4 font-medium text-slate-700">{row.supplier_name}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={13} className="text-slate-400" />
                      {formatDate(row.date)}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-500">{row.product_code || '-'}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{row.product_name}</td>
                  <td className="py-3 px-4 text-right text-slate-600">{formatCurr(row.dp_price)}</td>
                  <td className="py-3 px-4 text-right text-slate-600">{formatNum(row.discount_pct)}%</td>
                  <td className="py-3 px-4 text-right text-slate-600">{formatCurr(row.actual_dp)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700">{formatNum(row.qty)}</td>
                  <td className="py-3 px-4 text-right font-bold text-slate-800">{formatCurr(row.total_amount)}</td>
                  <td className="py-3 px-4 text-right text-amber-600">{formatCurr(row.discount_amount)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-brand-green">{formatCurr(row.deposit_amount)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-brand-green">{formatNum(row.received_qty)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-brand-red">{formatNum(pendingQty)}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${
                      status === 'received'
                        ? 'bg-green-100 text-green-700'
                        : status === 'partial'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-orange-100 text-orange-700'
                    }`}>
                      {status === 'received' ? 'Received' : status === 'partial' ? 'Partial' : 'Pending'}
                    </span>
                  </td>
                </tr>
              )
            })}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={16} className="py-10 text-center text-slate-400">
                  No purchase history found
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={16} className="py-10 text-center text-slate-400">
                  Loading purchase history...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
