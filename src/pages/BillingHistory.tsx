import React, { useEffect, useMemo, useState } from 'react'
import { CreditCardIcon as CreditCard, ChatTextIcon as MessageSquareText, PackageIcon as Package, ArrowsClockwiseIcon as RefreshCcw, WalletIcon as Wallet } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../components/PageHeader'
import TableScroller from '../components/TableScroller'
import StatCard from '../components/StatCard'
import { formatDate } from '../lib/utils'
import { useLang } from '../context/LanguageContext'
import { getMySubscriptionPayments } from '../services/admin.services'
import { getMySmsPurchases, getSmsWallet } from '../services/sms.services'
import { NoValue } from '../components/CellValue'

type Kind = 'plan' | 'sms'

// One line in the combined history - a plan payment or an SMS package purchase.
type BillingRow = {
  id: string
  kind: Kind
  date: string
  invoice: string
  item: string
  detail: string
  amount: number
  status: string
  trxId: string
}

const badgeFor = (status: string) => {
  const value = status.toLowerCase()
  if (value === 'paid') return 'badge-green'
  if (value === 'pending') return 'badge-orange'
  return 'badge-red'
}

export default function BillingHistory() {
  const { formatCurr, formatNum, lang } = useLang()
  const bn = lang === 'bn'
  const [rows, setRows] = useState<BillingRow[]>([])
  const [smsBalance, setSmsBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      // Either list may fail independently (e.g. SMS never used), so don't let
      // one failure blank out the whole page.
      const [planResult, smsResult] = await Promise.allSettled([
        getMySubscriptionPayments(),
        getMySmsPurchases(),
      ])

      const planRows: BillingRow[] = planResult.status === 'fulfilled'
        ? (planResult.value || []).map((p: any) => ({
          id: `plan-${p.id}`,
          kind: 'plan' as Kind,
          date: p.date || p.created_at,
          invoice: p.invoice_no || '-',
          item: p.plan_type === 'yearly'
            ? (bn ? 'বার্ষিক প্ল্যান' : 'Yearly plan')
            : p.plan_type === 'monthly'
              ? (bn ? 'মাসিক প্ল্যান' : 'Monthly plan')
              : (bn ? 'প্ল্যান' : 'Plan'),
          detail: bn ? 'সফটওয়্যার সাবস্ক্রিপশন' : 'Software subscription',
          amount: Number(p.amount || 0),
          status: p.status || 'pending',
          trxId: p.trx_id || '-',
        }))
        : []

      const smsRows: BillingRow[] = smsResult.status === 'fulfilled'
        ? (smsResult.value || []).map((s: any) => ({
          id: `sms-${s.id}`,
          kind: 'sms' as Kind,
          date: s.date || s.created_at,
          invoice: s.invoice_no || '-',
          item: s.package_name || (bn ? 'এসএমএস প্যাকেজ' : 'SMS package'),
          detail: `${formatNum(Number(s.sms_count || 0))} ${bn ? 'এসএমএস ক্রেডিট' : 'SMS credits'}`,
          amount: Number(s.amount || 0),
          status: s.status || 'pending',
          trxId: s.trx_id || '-',
        }))
        : []

      setRows([...planRows, ...smsRows].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ))
    } catch (error: any) {
      toast.error(error.message || 'Failed to load billing history')
    } finally {
      setLoading(false)
    }

    getSmsWallet().then(w => setSmsBalance(w.balance)).catch(() => setSmsBalance(null))
  }

  const displayed = useMemo(
    () => (kindFilter === 'all' ? rows : rows.filter(r => r.kind === kindFilter)),
    [rows, kindFilter]
  )

  const paidRows = rows.filter(r => r.status === 'paid')
  const totalPlanSpend = paidRows.filter(r => r.kind === 'plan').reduce((s, r) => s + r.amount, 0)
  const totalSmsSpend = paidRows.filter(r => r.kind === 'sms').reduce((s, r) => s + r.amount, 0)
  // The SMS package they are actually on = their most recent approved purchase.
  const currentSmsPackage = paidRows.find(r => r.kind === 'sms')

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6">
      <PageHeader
        title={bn ? 'বিলিং হিস্টোরি' : 'Billing History'}
        subtitle={bn ? 'আপনার কেনা সব প্ল্যান ও এসএমএস প্যাকেজ' : 'Every plan and SMS package you have purchased'}
        actions={<button className="btn-secondary" onClick={load}><RefreshCcw size={16} /> {bn ? 'রিফ্রেশ' : 'Refresh'}</button>}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={bn ? 'প্ল্যানে মোট খরচ' : 'Spent on plans'} value={formatCurr(totalPlanSpend)} icon={<CreditCard size={20} />} color="green" />
        <StatCard title={bn ? 'এসএমএসে মোট খরচ' : 'Spent on SMS'} value={formatCurr(totalSmsSpend)} icon={<MessageSquareText size={20} />} color="blue" />
        <StatCard
          title={bn ? 'বর্তমান এসএমএস প্যাকেজ' : 'Current SMS package'}
          value={currentSmsPackage ? currentSmsPackage.item : (bn ? 'কোনোটি নয়' : 'None')}
          icon={<Package size={20} />}
          color="orange"
        />
        <StatCard
          title={bn ? 'এসএমএস ব্যালেন্স' : 'SMS balance'}
          value={smsBalance === null ? <NoValue /> : formatNum(smsBalance)}
          icon={<Wallet size={20} />}
          color="green"
        />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-bold text-slate-900">{bn ? 'সব কেনাকাটা' : 'All purchases'}</h2>
          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value as 'all' | Kind)}
            className="input h-10 w-auto"
            title={bn ? 'ধরন' : 'Type'}
          >
            <option value="all">{bn ? 'সব' : 'All'}</option>
            <option value="plan">{bn ? 'প্ল্যান' : 'Plans'}</option>
            <option value="sms">{bn ? 'এসএমএস প্যাকেজ' : 'SMS packages'}</option>
          </select>
        </div>

        <TableScroller className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">{bn ? 'তারিখ' : 'Date'}</th>
                <th className="px-4 py-3 text-left">{bn ? 'ধরন' : 'Type'}</th>
                <th className="px-4 py-3 text-left">{bn ? 'যা কিনেছেন' : 'Item'}</th>
                <th className="px-4 py-3 text-left">{bn ? 'বিস্তারিত' : 'Details'}</th>
                <th className="px-4 py-3 text-left">{bn ? 'ইনভয়েস' : 'Invoice'}</th>
                <th className="px-4 py-3 text-left">TrxID</th>
                <th className="px-4 py-3 text-left">{bn ? 'অবস্থা' : 'Status'}</th>
                <th className="px-4 py-3 text-right">{bn ? 'টাকা' : 'Amount'}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">{bn ? 'লোড হচ্ছে...' : 'Loading...'}</td></tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">{bn ? 'কোনো কেনাকাটা নেই' : 'No purchases yet'}</td></tr>
              )}
              {!loading && displayed.map(row => (
                <tr key={row.id} className="table-row">
                  <td className="px-4 py-3 text-slate-600">{row.date ? formatDate(row.date) : <NoValue />}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${row.kind === 'plan' ? 'bg-slate-900 text-white' : 'bg-neutral-100 text-navy-900'}`}>
                      {row.kind === 'plan' ? <CreditCard size={12} /> : <MessageSquareText size={12} />}
                      {row.kind === 'plan' ? (bn ? 'প্ল্যান' : 'Plan') : (bn ? 'এসএমএস' : 'SMS')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.item}</td>
                  <td className="px-4 py-3 text-slate-600">{row.detail}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.invoice}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.trxId}</td>
                  <td className="px-4 py-3"><span className={badgeFor(row.status)}>{row.status}</span></td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-800">{formatCurr(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </div>
    </div>
  )
}
