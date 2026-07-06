import React, { useState, useEffect } from 'react'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { Users, Wallet, ShoppingCart, Tag, Download, AlertCircle } from 'lucide-react'
import { useLang } from '../../context/LanguageContext'
import { loadCustomerDashboardDataset, subscribeCustomerDashboardDataset } from './customerDashboardData'

export default function CustomerDashboard() {
  const { t, formatCurr, monthName } = useLang()
  const [stats, setStats] = useState({
    totalCustomers: 0, openingDue: 0, totalPurchase: 0,
    totalDiscount: 0, collectionsAmount: 0, extraDiscount: 0, currentDue: 0,
  })
  const [customerList, setCustomerList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    loadData()
    return subscribeCustomerDashboardDataset(loadData)
  }, [])

  async function loadData() {
    const dataset = await loadCustomerDashboardDataset()
    setStats(dataset.stats)
    setCustomerList(dataset.customerList)
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full" /></div>

  return (
    <div className="overflow-x-hidden p-4 sm:p-6 lg:p-8">
      <PageHeader title={t('customerDash_title')} subtitle={`${t('customerDash_subtitle')} — ${monthName(currentMonth)} ${currentYear}`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7 gap-4 mb-6">
        <StatCard title={t('customerDash_totalCustomers')} value={String(stats.totalCustomers)} icon={<Users size={20} />} color="green" />
        <StatCard title={t('customerDash_openingDue')} value={formatCurr(stats.openingDue)} icon={<Wallet size={20} />} color="orange" />
        <StatCard title={t('customerDash_totalPurchase')} value={formatCurr(stats.totalPurchase)} icon={<ShoppingCart size={20} />} color="blue" />
        <StatCard title="Discount" value={formatCurr(stats.totalDiscount)} icon={<Tag size={20} />} color="red" />
        <StatCard title={t('customerDash_collectionsAmount')} value={formatCurr(stats.collectionsAmount)} icon={<Download size={20} />} color="green" />
        <StatCard title="Extra Discount" value={formatCurr(stats.extraDiscount)} icon={<Tag size={20} />} color="orange" />
        <StatCard title={t('customerDash_currentDue')} value={formatCurr(stats.currentDue)} icon={<AlertCircle size={20} />} color="red" />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{t('customerDash_customerList')}</h3>
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-auto">
        <table className="w-full min-w-[1240px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4">{t('customerDash_colRank')}</th>
              <th className="text-left py-2 px-4">{t('customerDash_colCustomer')}</th>
              <th className="text-left py-2 px-4">{t('customerDash_colAddress')}</th>
              <th className="text-right py-2 px-4">{t('customerDash_openingDue')}</th>
              <th className="text-right py-2 px-4">{t('customerDash_colTotalPurchase')}</th>
              <th className="text-right py-2 px-4">Discount</th>
              <th className="text-right py-2 px-4">{t('customerDash_colCollectionsAmount')}</th>
              <th className="text-right py-2 px-4">Extra Discount</th>
              <th className="text-right py-2 px-4">{t('customerDash_currentDue')}</th>
            </tr>
          </thead>
          <tbody>
            {customerList.map((c, i) => (
              <tr key={c.id} className="table-row">
                <td className="py-2.5 px-4 text-slate-400 font-mono">{i + 1}</td>
                <td className="py-2.5 px-4">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.phone}</p>
                </td>
                <td className="py-2.5 px-4 text-slate-500 max-w-64 truncate" title={c.address || ''}>{c.address || '-'}</td>
                <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">{formatCurr(c.openingDue)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums font-medium whitespace-nowrap">{formatCurr(c.totalPurchase)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-amber-600 whitespace-nowrap">{formatCurr(c.totalDiscount)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-brand-green whitespace-nowrap">{formatCurr(c.collectionsAmount)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-orange-600 whitespace-nowrap">{formatCurr(c.extraDiscount)}</td>
                <td className="py-2.5 px-4 text-right">
                  <span className={`tabular-nums whitespace-nowrap ${c.currentDue > 0 ? 'text-brand-red font-semibold' : 'text-brand-green'}`}>
                    {formatCurr(c.currentDue)}
                  </span>
                </td>
              </tr>
            ))}
            {customerList.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-slate-400">{t('customerDash_noData')}</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
