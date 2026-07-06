import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Printer, Search } from 'lucide-react'
import { useReactToPrint } from 'react-to-print'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { useLang } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

type LedgerInvoice = {
  id: string
  si_no: string
  supplier_id: string
  supplier_name: string
  order_date: string
  invoice_date: string
  total_bill: number
  invoice_dp: number
  quantity: number
  total_dp_amount: number
  total: number
  discount_amount: number
  special_discount_amount: number
  actual_deposit_amount: number
  previous_due: number
  grand_total: number
  paid_amount: number
  due_amount: number
  items: any[]
}

type EditablePurchaseItem = {
  id: string
  product_code: string
  product_name: string
  dp_price: number
  discount_pct: number
  actual_dp: number
  qty: number
  total_amount: number
  sp_amount: number
  received_qty: number
}

function latestReceiveDate(purchase: any) {
  const dates = (purchase.purchase_items || [])
    .flatMap((item: any) => item.purchase_receives || [])
    .map((receive: any) => receive.receive_date)
    .filter(Boolean)
    .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())

  return dates[0] || purchase.date
}

function purchaseTotal(purchase: any) {
  const itemTotal = (purchase.purchase_items || []).reduce(
    (sum: number, item: any) => sum + Number(item.total_amount || 0),
    0
  )
  return Number(purchase.net_amount || purchase.total_amount || itemTotal || 0)
}

function invoiceMetrics(purchase: any) {
  const items = purchase.purchase_items || []
  const invoiceDp = items.reduce((sum: number, item: any) => sum + Number(item.dp_price || 0), 0)
  const quantity = items.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0)
  const totalDpAmount = items.reduce((sum: number, item: any) => {
    const dp = Number(item.dp_price || 0)
    const qty = Number(item.qty || 0)
    return sum + (dp * qty)
  }, 0)
  const total = items.reduce((sum: number, item: any) => sum + Number(item.total_amount || 0), 0)
  const discountAmount = items.reduce((sum: number, item: any) => {
    const dp = Number(item.dp_price || 0)
    const discountPct = Number(item.discount_pct || 0)
    const qty = Number(item.qty || 0)
    return sum + ((dp * discountPct) / 100) * qty
  }, 0)
  const specialDiscountAmount = items.reduce((sum: number, item: any) => sum + Number(item.sp_amount || 0), 0)
  const actualDepositAmount = items.reduce((sum: number, item: any) => {
    const itemTotal = Number(item.total_amount || 0)
    const spAmount = Number(item.sp_amount || 0)
    return sum + Math.max(0, itemTotal - spAmount)
  }, 0)
  const previousDue = Number(purchase.previous_due || 0)

  return {
    invoiceDp,
    quantity,
    totalDpAmount,
    total,
    discountAmount,
    specialDiscountAmount,
    actualDepositAmount,
    previousDue,
    grandTotal: previousDue + actualDepositAmount,
  }
}

export default function PurchaseLedger() {
  const { t, formatCurr, formatNum } = useLang()
  const { touchOwnerActivity } = useAuth()
  const [invoices, setInvoices] = useState<LedgerInvoice[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedInvoice, setSelectedInvoice] = useState<LedgerInvoice | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<LedgerInvoice | null>(null)
  const [editForm, setEditForm] = useState({ si_no: '', supplier_name: '', date: '' })
  const [editItems, setEditItems] = useState<EditablePurchaseItem[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const invoiceRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({ content: () => invoiceRef.current })

  useEffect(() => {
    loadLedger()
  }, [])

  async function loadLedger() {
    try {
      setLoading(true)
      const [purchaseRes, paymentRes] = await Promise.all([
        supabase
          .from('purchases')
          .select('*, purchase_items(*, purchase_receives(*))')
          .in('shipping_status', ['pending', 'partial', 'received'])
          .order('date', { ascending: false }),
        supabase
          .from('supplier_payments')
          .select('id, purchase_id, purchase_si_no, amount'),
      ])

      if (purchaseRes.error) throw purchaseRes.error
      if (paymentRes.error) throw paymentRes.error

      const payments = paymentRes.data || []
      const nextInvoices = (purchaseRes.data || []).map((purchase: any) => {
        const totalBill = purchaseTotal(purchase)
        const metrics = invoiceMetrics(purchase)
        const paidAmount = payments
          .filter((payment: any) =>
            (payment.purchase_id && payment.purchase_id === purchase.id) ||
            (!payment.purchase_id && payment.purchase_si_no && payment.purchase_si_no === purchase.si_no)
          )
          .reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)

        return {
          id: purchase.id,
          si_no: purchase.si_no || '-',
          supplier_id: purchase.supplier_id || '',
          supplier_name: purchase.supplier_name || '-',
          order_date: purchase.date,
          invoice_date: latestReceiveDate(purchase),
          total_bill: totalBill,
          invoice_dp: metrics.invoiceDp,
          quantity: metrics.quantity,
          total_dp_amount: metrics.totalDpAmount,
          total: metrics.total,
          discount_amount: metrics.discountAmount,
          special_discount_amount: metrics.specialDiscountAmount,
          actual_deposit_amount: metrics.actualDepositAmount,
          previous_due: metrics.previousDue,
          grand_total: metrics.grandTotal,
          paid_amount: paidAmount,
          due_amount: Math.max(0, totalBill - paidAmount),
          items: purchase.purchase_items || [],
        }
      })

      setInvoices(nextInvoices)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load purchase ledger')
    } finally {
      setLoading(false)
    }
  }

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(invoice =>
      invoice.si_no.toLowerCase().includes(q) ||
      invoice.supplier_name.toLowerCase().includes(q)
    )
  }, [invoices, search])

  const editTotal = editItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
  const editDue = Math.max(0, editTotal - Number(editingInvoice?.paid_amount || 0))

  function openEditInvoice(invoice: LedgerInvoice) {
    setEditingInvoice(invoice)
    setEditForm({
      si_no: invoice.si_no,
      supplier_name: invoice.supplier_name,
      date: invoice.order_date,
    })
    setEditItems(invoice.items.map((item: any) => ({
      id: item.id,
      product_code: item.product_code || '',
      product_name: item.product_name || '',
      dp_price: Number(item.dp_price || 0),
      discount_pct: Number(item.discount_pct || 0),
      actual_dp: Number(item.actual_dp || item.dp_price || 0),
      qty: Number(item.qty || 0),
      total_amount: Number(item.total_amount || 0),
      sp_amount: Number(item.sp_amount || 0),
      received_qty: Number(item.received_qty || 0),
    })))
  }

  function closeEditInvoice() {
    setEditingInvoice(null)
    setEditItems([])
    setEditForm({ si_no: '', supplier_name: '', date: '' })
  }

  function updateEditItem(index: number, field: keyof EditablePurchaseItem, value: string | number) {
    setEditItems(current => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const next = { ...item, [field]: value }
      const dp = Number(next.dp_price || 0)
      const discount = Number(next.discount_pct || 0)
      const qty = Number(next.qty || 0)
      next.actual_dp = dp * (1 - discount / 100)
      next.total_amount = next.actual_dp * qty
      return next
    }))
  }

  async function saveEditedInvoice() {
    if (!editingInvoice) return
    if (!editForm.si_no.trim() || !editForm.date) {
      toast.error('Invoice no and date are required')
      return
    }

    const invalidItem = editItems.find(item => !item.product_name.trim() || Number(item.qty || 0) < Number(item.received_qty || 0))
    if (invalidItem) {
      toast.error('Item name is required and qty cannot be less than received qty')
      return
    }

    try {
      setSavingEdit(true)
      const { error: purchaseError } = await supabase
        .from('purchases')
        .update({
          si_no: editForm.si_no.trim(),
          supplier_name: editForm.supplier_name.trim() || editingInvoice.supplier_name,
          date: editForm.date,
          total_amount: editTotal,
          net_amount: editTotal,
          due_amount: editDue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingInvoice.id)

      if (purchaseError) throw purchaseError

      for (const item of editItems) {
        const { error: itemError } = await supabase
          .from('purchase_items')
          .update({
            product_code: item.product_code,
            product_name: item.product_name,
            dp_price: item.dp_price,
            discount_pct: item.discount_pct,
            actual_dp: item.actual_dp,
            qty: item.qty,
            total_amount: item.total_amount,
            sp_amount: item.sp_amount,
          })
          .eq('id', item.id)

        if (itemError) throw itemError
      }

      await touchOwnerActivity(true)
      toast.success('Purchase invoice updated')
      closeEditInvoice()
      await loadLedger()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update purchase invoice')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 p-6">
      <PageHeader
        title={t('purchaseLedger_title', 'Purchase Ledger')}
        subtitle={t('purchaseLedger_subtitle', 'Submitted purchase invoices by supplier')}
      />

      <div className="mb-4 flex flex-shrink-0 flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="input pl-9"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search supplier or invoice..."
          />
        </div>
        <div className="card px-4 py-2 text-sm text-slate-600">
          Invoices: <strong className="text-slate-800">{formatNum(filteredInvoices.length)}</strong>
        </div>
      </div>

      <div className="card min-h-0 flex-1 overflow-auto bg-white p-0">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Invoice No</th>
              <th className="px-4 py-3 text-left">Supplier</th>
              <th className="px-4 py-3 text-left">Invoice Date</th>
              <th className="px-4 py-3 text-right">Quantity</th>
              <th className="px-4 py-3 text-right">Total DP Amount</th>
              <th className="px-4 py-3 text-right">Regular Discount</th>
              <th className="px-4 py-3 text-right">Special discount</th>
              <th className="px-4 py-3 text-right">Grand Total</th>
              <th className="px-4 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice, index) => (
              <tr key={invoice.id} className="table-row">
                <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{invoice.si_no}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{invoice.supplier_name}</td>
                <td className="px-4 py-3">{formatDate(invoice.invoice_date)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatNum(invoice.quantity)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurr(invoice.total_dp_amount)}</td>
                <td className="px-4 py-3 text-right font-semibold text-orange-600">{formatCurr(invoice.discount_amount)}</td>
                <td className="px-4 py-3 text-right font-semibold text-orange-600">{formatCurr(invoice.special_discount_amount)}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurr(invoice.grand_total)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => openEditInvoice(invoice)}
                      className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
                      title="Edit purchase invoice"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setSelectedInvoice(invoice)}
                      className="rounded p-1.5 text-slate-600 hover:bg-slate-50"
                      title="Print invoice"
                    >
                      <Printer size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-slate-400">
                  No received purchase invoices found
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-slate-400">
                  Loading purchase ledger...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!selectedInvoice} onClose={() => setSelectedInvoice(null)} title="Purchase Invoice / Voucher Details" size="xl">
        {selectedInvoice && (
          <>
            <div ref={invoiceRef} className="invoice-print-page bg-white text-slate-950">
              <div className="invoice-print-inner">
                <h2 className="mb-4 text-center text-[24px] font-bold leading-none text-slate-950">Purchase Invoice / Voucher</h2>
                <div className="grid grid-cols-2 gap-8 border-b border-slate-300 pb-4 text-[12px]">
                  <div className="space-y-2">
                    <p><span className="font-bold">Supplier:</span> {selectedInvoice.supplier_name}</p>
                    <p><span className="font-bold">Invoice No:</span> <span className="font-mono">{selectedInvoice.si_no}</span></p>
                  </div>
                  <div className="space-y-2 text-right">
                    <p><span className="font-bold">Order Date:</span> {formatDate(selectedInvoice.order_date)}</p>
                    <p><span className="font-bold">Invoice Date:</span> {formatDate(selectedInvoice.invoice_date)}</p>
                  </div>
                </div>

                <table className="mt-5 w-full text-[9px] border border-slate-600">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-600 px-1.5 py-2 text-center w-6">#</th>
                      <th className="border border-slate-600 px-1.5 py-2 text-left">Product Code</th>
                      <th className="border border-slate-600 px-1.5 py-2 text-left">Product</th>
                      <th className="border border-slate-600 px-1.5 py-2 text-right">DP Amount<br />(৳)</th>
                      <th className="border border-slate-600 px-1.5 py-2 text-right">Discount %</th>
                      <th className="border border-slate-600 px-1.5 py-2 text-right">Actual DP</th>
                      <th className="border border-slate-600 px-1.5 py-2 text-right">Quantity</th>
                      <th className="border border-slate-600 px-1.5 py-2 text-right">Total</th>
                      <th className="border border-slate-600 px-1.5 py-2 text-right">SP Amount<br />(৳)</th>
                      <th className="border border-slate-600 px-1.5 py-2 text-right">Actual Deposit Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.items.map((item: any, index: number) => (
                      <tr key={item.id || index}>
                        <td className="border border-slate-600 px-1.5 py-2 text-center">{index + 1}</td>
                        <td className="border border-slate-600 px-1.5 py-2 font-mono">{item.product_code || '-'}</td>
                        <td className="border border-slate-600 px-1.5 py-2">{item.product_name || '-'}</td>
                        <td className="border border-slate-600 px-1.5 py-2 text-right">{formatCurr(Number(item.dp_price || 0))}</td>
                        <td className="border border-slate-600 px-1.5 py-2 text-right">{formatNum(Number(item.discount_pct || 0))}%</td>
                        <td className="border border-slate-600 px-1.5 py-2 text-right">{formatCurr(Number(item.actual_dp || item.dp_price || 0))}</td>
                        <td className="border border-slate-600 px-1.5 py-2 text-right">{formatNum(Number(item.qty || 0))}</td>
                        <td className="border border-slate-600 px-1.5 py-2 text-right font-semibold">{formatCurr(Number(item.total_amount || 0))}</td>
                        <td className="border border-slate-600 px-1.5 py-2 text-right">{formatCurr(Number(item.sp_amount || 0))}</td>
                        <td className="border border-slate-600 px-1.5 py-2 text-right font-semibold">{formatCurr(Math.max(0, Number(item.total_amount || 0) - Number(item.sp_amount || 0)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="ml-auto mt-6 w-full max-w-xs space-y-3 text-[12px]">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurr(selectedInvoice.total_dp_amount)}</span></div>
                  <div className="flex justify-between"><span>Discount</span><span>{formatCurr(selectedInvoice.discount_amount)}</span></div>
                  <div className="flex justify-between"><span>SP Discount</span><span>{formatCurr(selectedInvoice.special_discount_amount)}</span></div>
                  <div className="border-t border-slate-400 pt-3 flex justify-between font-bold"><span>Grand Total</span><span>{formatCurr(selectedInvoice.actual_deposit_amount)}</span></div>
                </div>
              </div>
            </div>
            <button onClick={handlePrint} className="btn-primary mt-4 w-full justify-center">
              <Printer size={16} /> Print Invoice
            </button>
          </>
        )}
      </Modal>

      <Modal isOpen={!!editingInvoice} onClose={closeEditInvoice} title="Edit Purchase Invoice / Voucher" size="xl">
        {editingInvoice && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label>
                <span className="label">Supplier Name</span>
                <input
                  className="input"
                  value={editForm.supplier_name}
                  onChange={event => setEditForm({ ...editForm, supplier_name: event.target.value })}
                />
              </label>
              <label>
                <span className="label">Invoice No</span>
                <input
                  className="input font-mono"
                  value={editForm.si_no}
                  onChange={event => setEditForm({ ...editForm, si_no: event.target.value })}
                />
              </label>
              <label>
                <span className="label">Date</span>
                <input
                  type="date"
                  className="input"
                  value={editForm.date}
                  onChange={event => setEditForm({ ...editForm, date: event.target.value })}
                />
              </label>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[980px] text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-3 text-left">#</th>
                    <th className="px-3 py-3 text-left">Product Code</th>
                    <th className="px-3 py-3 text-left">Item Name</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3 text-right">Received</th>
                    <th className="px-3 py-3 text-right">Price</th>
                    <th className="px-3 py-3 text-right">Discount %</th>
                    <th className="px-3 py-3 text-right">Actual Price</th>
                    <th className="px-3 py-3 text-right">Total Bill</th>
                  </tr>
                </thead>
                <tbody>
                  {editItems.map((item, index) => (
                    <tr key={item.id} className="border-t border-slate-100 bg-white">
                      <td className="px-3 py-3 font-semibold text-slate-500">{index + 1}</td>
                      <td className="px-3 py-3">
                        <input className="input h-10 w-28 text-xs font-mono" value={item.product_code} onChange={event => updateEditItem(index, 'product_code', event.target.value)} />
                      </td>
                      <td className="px-3 py-3">
                        <input className="input h-10 min-w-[220px] text-xs" value={item.product_name} onChange={event => updateEditItem(index, 'product_name', event.target.value)} />
                      </td>
                      <td className="px-3 py-3">
                        <input type="number" min={item.received_qty} className="input h-10 w-20 text-right text-xs" value={item.qty || ''} onChange={event => updateEditItem(index, 'qty', Number(event.target.value))} />
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-brand-green">{formatNum(item.received_qty)}</td>
                      <td className="px-3 py-3">
                        <input type="number" min="0" className="input h-10 w-24 text-right text-xs" value={item.dp_price || ''} onChange={event => updateEditItem(index, 'dp_price', Number(event.target.value))} />
                      </td>
                      <td className="px-3 py-3">
                        <input type="number" min="0" max="100" className="input h-10 w-20 text-right text-xs" value={item.discount_pct || ''} onChange={event => updateEditItem(index, 'discount_pct', Number(event.target.value))} />
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-800">{formatCurr(item.actual_dp)}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-800">{formatCurr(item.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="card bg-slate-50 shadow-none">
                <p className="text-xs text-slate-500">Total Bill</p>
                <p className="mt-1 text-xl font-bold text-slate-800">{formatCurr(editTotal)}</p>
              </div>
              <div className="card bg-slate-50 shadow-none">
                <p className="text-xs text-slate-500">Paid Amount</p>
                <p className="mt-1 text-xl font-bold text-brand-green">{formatCurr(editingInvoice.paid_amount)}</p>
              </div>
              <div className="card bg-slate-50 shadow-none">
                <p className="text-xs text-slate-500">Due Amount</p>
                <p className="mt-1 text-xl font-bold text-brand-red">{formatCurr(editDue)}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={closeEditInvoice} className="btn-secondary">Cancel</button>
              <button onClick={saveEditedInvoice} disabled={savingEdit} className="btn-primary">
                {savingEdit ? 'Updating...' : 'Update Purchase Invoice'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
