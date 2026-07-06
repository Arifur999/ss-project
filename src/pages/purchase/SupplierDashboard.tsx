import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import { useLang } from '../../context/LanguageContext'

export default function SupplierDashboard() {
  const { t, formatCurr } = useLang()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [supRes, poRes, payRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('is_active', true),
      supabase.from('purchases').select('supplier_id, purchase_items(*, purchase_receives(received_qty))'),
      supabase.from('supplier_payments').select('supplier_id, amount'),
    ])

    const suppliers = supRes.data || []
    const purchases = poRes.data || []
    const payments = payRes.data || []

    const result = suppliers.map(sup => {
      const supplierPurchases = purchases.filter(p => p.supplier_id === sup.id)
      const supplierItems = supplierPurchases.flatMap((purchase: any) => purchase.purchase_items || [])
      const openingRaw = Math.abs(Number(sup.opening_due || 0))
      const openingBalance = sup.due_type === 'pawna' ? openingRaw : -openingRaw

      const totalDpAmount = supplierItems.reduce((sum: number, item: any) => {
        const dpPrice = Number(item.dp_price || 0)
        const qty = Number(item.qty || 0)
        return sum + (dpPrice * qty)
      }, 0)

      const regularDiscount = supplierItems.reduce((sum: number, item: any) => {
        const dpPrice = Number(item.dp_price || 0)
        const actualDp = Number(item.actual_dp || dpPrice)
        const qty = Number(item.qty || 0)
        return sum + Math.max(0, (dpPrice - actualDp) * qty)
      }, 0)

      const orderAmount = totalDpAmount - regularDiscount
      const specialDiscount = supplierItems.reduce((sum: number, item: any) => sum + Number(item.sp_amount || 0), 0)
      const actualAmount = Math.max(0, orderAmount - specialDiscount)
      const paymentAmount = payments.filter(p => p.supplier_id === sup.id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

      const availableBalance = openingBalance + paymentAmount - actualAmount

      return {
        ...sup,
        openingBalance,
        totalDpAmount,
        regularDiscount,
        orderAmount,
        specialDiscount,
        actualAmount,
        paymentAmount,
        availableBalance,
      }
    })

    setData(result.sort((a, b) => a.availableBalance - b.availableBalance))
    setLoading(false)
  }

  function signedColor(amount: number) {
    if (amount < 0) return 'text-brand-red'
    if (amount > 0) return 'text-brand-green'
    return 'text-slate-500'
  }

  const totalDue = data.filter(d => d.availableBalance < 0).reduce((sum, item) => sum + Math.abs(item.availableBalance), 0)
  const totalPurchase = data.reduce((sum, item) => sum + item.actualAmount, 0)
  const totalPaid = data.reduce((sum, item) => sum + item.paymentAmount, 0)

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-green border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader title={t('supplier_dashTitle')} subtitle={t('supplier_dashSubtitle')} />

      <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-3">
        <div className="card"><p className="text-xs text-slate-500">{t('supplier_totalPurchase')}</p><p className="text-2xl font-bold text-slate-800 mt-1">{formatCurr(totalPurchase)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('supplier_totalPaid')}</p><p className="text-2xl font-bold text-brand-green mt-1">{formatCurr(totalPaid)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('supplier_totalPayable')}</p><p className="text-2xl font-bold text-brand-red mt-1">{formatCurr(totalDue)}</p></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">{t('supplier_summaryTable')}</div>
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4">#</th>
              <th className="text-left py-2 px-4">Supplier</th>
              <th className="text-left py-2 px-4">Phone</th>
              <th className="text-right py-2 px-4">Opening Dena/Pawna</th>
              <th className="text-right py-2 px-4">Order Amount</th>
              <th className="text-right py-2 px-4">Special discount</th>
              <th className="text-right py-2 px-4">Actual</th>
              <th className="text-right py-2 px-4">Payment</th>
              <th className="text-right py-2 px-4">Available Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.map((sup, index) => (
              <tr key={sup.id} className="table-row">
                <td className="py-2.5 px-4 font-medium">{index + 1}</td>
                <td className="py-2.5 px-4 font-medium">{sup.company_name || sup.name}</td>
                <td className="py-2.5 px-4 text-slate-500">{sup.phone || '-'}</td>
                <td className={`py-2.5 px-4 text-right font-semibold ${signedColor(sup.openingBalance)}`}>{formatCurr(sup.openingBalance)}</td>
                <td className="py-2.5 px-4 text-right">{formatCurr(sup.orderAmount)}</td>
                <td className="py-2.5 px-4 text-right text-brand-red">{sup.specialDiscount ? `-${formatCurr(sup.specialDiscount)}` : formatCurr(0)}</td>
                <td className="py-2.5 px-4 text-right">{formatCurr(sup.actualAmount)}</td>
                <td className="py-2.5 px-4 text-right">{formatCurr(sup.paymentAmount)}</td>
                <td className={`py-2.5 px-4 text-right font-semibold ${signedColor(sup.availableBalance)}`}>{formatCurr(sup.availableBalance)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  No supplier summary found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
