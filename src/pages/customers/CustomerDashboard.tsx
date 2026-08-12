import React, { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import StatCard from '../../components/StatCard'
import { Users, Wallet, ShoppingCart, Tag, Download, AlertCircle, Search, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLang } from '../../context/LanguageContext'
import { loadCustomerDashboardDataset, subscribeCustomerDashboardDataset } from './customerDashboardData'
import { supabase } from '../../lib/supabase'
import { buildDueSms, segmentsFor } from '../../lib/smsTemplates'
import { sendSms } from '../../services/sms.services'
import { confirmAction } from '../../components/ConfirmDialog'

type CustomerSort = 'due_desc' | 'due_asc' | 'purchase_desc' | 'collections_desc' | 'name_asc'

export default function CustomerDashboard() {
  const { t, formatCurr, monthName } = useLang()
  const [stats, setStats] = useState({
    totalCustomers: 0, openingDue: 0, totalPurchase: 0,
    totalDiscount: 0, collectionsAmount: 0, extraDiscount: 0, currentDue: 0,
  })
  const [customerList, setCustomerList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<CustomerSort>('due_desc')
  const [dueFilter, setDueFilter] = useState<'all' | 'due' | 'clear'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [business, setBusiness] = useState<any>(null)
  const [sendingSms, setSendingSms] = useState(false)

  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    loadData()
    loadBusiness()
    return subscribeCustomerDashboardDataset(loadData)
  }, [])

  async function loadData() {
    const dataset = await loadCustomerDashboardDataset()
    setStats(dataset.stats)
    setCustomerList(dataset.customerList)
    setLoading(false)
  }

  // Header lines of the reminder come from Settings > Business.
  async function loadBusiness() {
    const { data } = await supabase.from('business_settings').select('*').maybeSingle()
    setBusiness(data)
  }

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = customerList.filter((c: any) => {
      const matchesSearch = !q ||
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.phone || '').toLowerCase().includes(q) ||
        String(c.address || '').toLowerCase().includes(q)
      const matchesDue =
        dueFilter === 'all' ||
        (dueFilter === 'due' && Number(c.currentDue) > 0) ||
        (dueFilter === 'clear' && Number(c.currentDue) <= 0)
      return matchesSearch && matchesDue
    })
    const sorted = [...filtered]
    sorted.sort((a: any, b: any) => {
      switch (sortBy) {
        case 'due_asc': return Number(a.currentDue) - Number(b.currentDue)
        case 'purchase_desc': return Number(b.totalPurchase) - Number(a.totalPurchase)
        case 'collections_desc': return Number(b.collectionsAmount) - Number(a.collectionsAmount)
        case 'name_asc': return String(a.name || '').localeCompare(String(b.name || ''))
        case 'due_desc':
        default: return Number(b.currentDue) - Number(a.currentDue)
      }
    })
    return sorted
  }, [customerList, search, sortBy, dueFilter])

  // Only customers who owe something and have a number can actually be texted.
  const smsTargets = useMemo(
    () => displayed.filter((c: any) => selectedIds.includes(c.id) && Number(c.currentDue) > 0 && String(c.phone || '').trim()),
    [displayed, selectedIds]
  )

  const dueSmsFor = useCallback((customer: any) => {
    const paid = Number(customer.collectionsAmount || 0)
    const due = Number(customer.currentDue || 0)
    return buildDueSms({
      businessName: business?.name_en || business?.name_bn || '',
      businessPhone: business?.phone || '',
      customerName: customer.name || 'গ্রাহক',
      // Derived from the other two so the three lines always add up on the
      // customer's phone - discounts are already netted out of both.
      totalBill: paid + due,
      paid,
      due,
    })
  }, [business])

  const estimatedCredits = useMemo(
    () => smsTargets.reduce((sum: number, c: any) => sum + segmentsFor(dueSmsFor(c)), 0),
    [smsTargets, dueSmsFor]
  )

  const selectableIds = displayed.map((c: any) => c.id)
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.includes(id))

  function toggleAllVisible() {
    setSelectedIds(prev => allVisibleSelected
      ? prev.filter(id => !selectableIds.includes(id))
      : Array.from(new Set([...prev, ...selectableIds])))
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  // Every customer needs their own amount, so this is one request per person
  // rather than a single batch. Sent one at a time so a mid-way failure cannot
  // silently burn credits on the rest.
  async function sendDueSms() {
    const skipped = selectedIds.length - smsTargets.length
    if (smsTargets.length === 0) {
      toast.error('No selected customer has both a due amount and a phone number')
      return
    }

    const ok = await confirmAction({
      title: 'Send due reminder',
      message: `Text ${smsTargets.length} customer${smsTargets.length === 1 ? '' : 's'} about their due?`
        + ` This uses about ${estimatedCredits} SMS credit${estimatedCredits === 1 ? '' : 's'}.`
        + (skipped > 0 ? ` ${skipped} selected customer${skipped === 1 ? '' : 's'} will be skipped (no due or no phone).` : ''),
      confirmText: 'Send',
    })
    if (!ok) return

    setSendingSms(true)
    let sent = 0
    let failed = 0
    for (const customer of smsTargets) {
      try {
        await sendSms({ recipients: [String(customer.phone).trim()], message: dueSmsFor(customer) })
        sent += 1
      } catch {
        failed += 1
      }
    }
    setSendingSms(false)

    if (sent > 0) toast.success(`Due reminder sent to ${sent} customer${sent === 1 ? '' : 's'}`)
    if (failed > 0) toast.error(`${failed} reminder${failed === 1 ? '' : 's'} could not be sent`)
    if (failed === 0) setSelectedIds([])
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
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-semibold text-slate-800">{t('customerDash_customerList')}</h3>
            {selectedIds.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                {selectedIds.length} selected
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={sendDueSms}
              disabled={sendingSms || smsTargets.length === 0}
              title={smsTargets.length === 0 ? 'Select customers who have a due and a phone number' : `About ${estimatedCredits} SMS credits`}
              className="btn-primary flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
            >
              <MessageSquare size={16} />
              {sendingSms ? 'Sending...' : `Send Due SMS${smsTargets.length > 0 ? ` (${smsTargets.length})` : ''}`}
            </button>
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone or address..." className="input pl-9" />
            </div>
            <select value={dueFilter} onChange={e => setDueFilter(e.target.value as 'all' | 'due' | 'clear')} className="input min-w-[120px] max-w-[150px]" title="Filter">
              <option value="all">All Customers</option>
              <option value="due">Has Due</option>
              <option value="clear">No Due</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as CustomerSort)} className="input min-w-[150px] max-w-[190px]" title="Sort by">
              <option value="due_desc">Current Due (high-low)</option>
              <option value="due_asc">Current Due (low-high)</option>
              <option value="purchase_desc">Total Purchase (high-low)</option>
              <option value="collections_desc">Collections (high-low)</option>
              <option value="name_asc">Name (A-Z)</option>
            </select>
          </div>
        </div>
        <TableScroller className="max-h-[calc(100vh-220px)] overflow-auto">
        <table className="w-full min-w-[1240px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="py-2 pl-4 pr-1 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  title="Select all visible customers"
                  className="h-4 w-4 rounded border-slate-300 accent-brand-green"
                />
              </th>
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
            {displayed.map((c, i) => (
              <tr key={c.id} className={`table-row ${selectedIds.includes(c.id) ? 'bg-slate-50' : ''}`}>
                <td className="py-2.5 pl-4 pr-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggleOne(c.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-brand-green"
                  />
                </td>
                <td className="py-2.5 px-4 text-slate-400 font-mono">{i + 1}</td>
                <td className="py-2.5 px-4">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.phone}</p>
                </td>
                <td className="py-2.5 px-4 text-slate-500 max-w-64 truncate" title={c.address || ''}>{c.address || '-'}</td>
                <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">{formatCurr(c.openingDue)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums font-medium whitespace-nowrap">{formatCurr(c.totalPurchase)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-brand-blue whitespace-nowrap">{formatCurr(c.totalDiscount)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-brand-green whitespace-nowrap">{formatCurr(c.collectionsAmount)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-brand-blue whitespace-nowrap">{formatCurr(c.extraDiscount)}</td>
                <td className="py-2.5 px-4 text-right">
                  <span className={`tabular-nums whitespace-nowrap ${c.currentDue > 0 ? 'text-brand-red font-semibold' : 'text-brand-green'}`}>
                    {formatCurr(c.currentDue)}
                  </span>
                </td>
              </tr>
            ))}
            {displayed.length === 0 && <tr><td colSpan={10} className="text-center py-10 text-slate-400">{search || dueFilter !== 'all' ? 'No matching customers' : t('customerDash_noData')}</td></tr>}
          </tbody>
        </table>
        </TableScroller>
      </div>
    </div>
  )
}
