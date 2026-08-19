import React, { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CreditCardIcon as CreditCard, DownloadSimpleIcon as Download, HourglassIcon as Hourglass, SparkleIcon as Sparkles, TrendUpIcon as TrendingUp, UsersIcon as Users } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { formatBDT } from './superAdminLive'
import { getSuperAdminReports } from '../../services/admin.services'

interface MonthlyPoint {
  month: string
  subscription: number
  sms: number
  revenue: number
  new_owners: number
}

interface PlatformReport {
  subscription_revenue: number
  sms_revenue: number
  total_revenue: number
  paid_payment_count: number
  sms_purchase_count: number
  pending_amount: number
  pending_count: number
  total_owners: number
  active_subscriptions: number
  on_trial: number
  expired: number
  monthly_plans: number
  yearly_plans: number
  monthly_revenue: number
  yearly_revenue: number
  monthly: MonthlyPoint[]
}

const EMPTY_REPORT: PlatformReport = {
  subscription_revenue: 0,
  sms_revenue: 0,
  total_revenue: 0,
  paid_payment_count: 0,
  sms_purchase_count: 0,
  pending_amount: 0,
  pending_count: 0,
  total_owners: 0,
  active_subscriptions: 0,
  on_trial: 0,
  expired: 0,
  monthly_plans: 0,
  yearly_plans: 0,
  monthly_revenue: 0,
  yearly_revenue: 0,
  monthly: [],
}

/** One line in the two breakdown panels. */
function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-700">{label}</p>
        {note && <p className="text-[11px] text-slate-400">{note}</p>}
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-navy-900">{value}</span>
    </div>
  )
}

export default function SuperAdminReports() {
  const [report, setReport] = useState<PlatformReport>(EMPTY_REPORT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    setLoading(true)
    try {
      const data = await getSuperAdminReports()
      setReport({ ...EMPTY_REPORT, ...(data || {}) })
    } catch (error: any) {
      toast.error(error.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  function downloadCsv() {
    const lines = [
      'Month,Subscription,SMS,Total revenue,New owners',
      ...report.monthly.map(point =>
        `${point.month},${point.subscription},${point.sms},${point.revenue},${point.new_owners}`),
      '',
      `Subscription revenue,${report.subscription_revenue}`,
      `SMS revenue,${report.sms_revenue}`,
      `Total revenue,${report.total_revenue}`,
      `Awaiting approval,${report.pending_amount}`,
      `Total owners,${report.total_owners}`,
      `Paying subscriptions,${report.active_subscriptions}`,
      `On free trial,${report.on_trial}`,
      `Expired,${report.expired}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `platform-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const paying = report.active_subscriptions
  // Of everyone who has ever signed up, how many ended up paying. The honest
  // denominator is every owner, not just the ones still around.
  const conversion = report.total_owners > 0 ? (paying / report.total_owners) * 100 : 0

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Reports"
        subtitle="This business: what the software earns, and who is paying for it"
        actions={
          <button className="btn-primary" onClick={downloadCsv}>
            <Download size={16} />
            Download report
          </button>
        }
      />

      {/* Money that actually reached us. Pending sits beside it rather than
          inside it - it has been sent, but it is not income until approved. */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total revenue" value={formatBDT(report.total_revenue)} icon={<TrendingUp size={20} />} color="green" />
        <StatCard title="Subscriptions" value={formatBDT(report.subscription_revenue)} icon={<CreditCard size={20} />} color="blue" />
        <StatCard title="SMS packages" value={formatBDT(report.sms_revenue)} icon={<Sparkles size={20} />} color="blue" />
        <StatCard title="Awaiting approval" value={formatBDT(report.pending_amount)} icon={<Hourglass size={20} />} color="orange" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Businesses signed up" value={String(report.total_owners)} icon={<Users size={20} />} color="blue" />
        <StatCard title="Paying now" value={String(paying)} icon={<CreditCard size={20} />} color="green" />
        <StatCard title="On free trial" value={String(report.on_trial)} icon={<Sparkles size={20} />} color="orange" />
        <StatCard title="Expired" value={String(report.expired)} icon={<Hourglass size={20} />} color="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h2 className="mb-1 font-semibold text-slate-800">Revenue, month by month</h2>
          <p className="mb-4 text-xs text-slate-500">Subscriptions and SMS packages, counted on the day the payment was approved.</p>
          {loading ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">Loading chart...</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={report.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `৳${Number(v) / 1000}k`} />
                <Tooltip formatter={(value: number) => formatBDT(value)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* Stacked, because the two together are the month's income and
                    the split is the second thing worth knowing about it. */}
                <Bar dataKey="subscription" stackId="revenue" fill="#0F1117" name="Subscriptions" />
                <Bar dataKey="sms" stackId="revenue" fill="#22C55E" name="SMS packages" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="card">
            <h2 className="mb-2 font-semibold text-slate-800">Where the money comes from</h2>
            <Row label="Monthly plans" value={formatBDT(report.monthly_revenue)} note={`${report.monthly_plans} paying now`} />
            <Row label="Yearly plans" value={formatBDT(report.yearly_revenue)} note={`${report.yearly_plans} paying now`} />
            <Row label="SMS packages" value={formatBDT(report.sms_revenue)} note={`${report.sms_purchase_count} purchases`} />
            <Row label="Awaiting approval" value={formatBDT(report.pending_amount)} note={`${report.pending_count} waiting`} />
          </div>

          <div className="card">
            <h2 className="mb-2 font-semibold text-slate-800">How the businesses split</h2>
            <Row label="Signed up" value={String(report.total_owners)} />
            <Row label="Paying" value={String(paying)} note={`${conversion.toFixed(1)}% of everyone who signed up`} />
            <Row label="On free trial" value={String(report.on_trial)} />
            <Row label="Expired" value={String(report.expired)} />
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <h2 className="mb-2 font-semibold text-slate-800">Month by month</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-3 py-2.5 text-left">Month</th>
                <th className="px-3 py-2.5 text-right">Subscriptions</th>
                <th className="px-3 py-2.5 text-right">SMS</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">New businesses</th>
              </tr>
            </thead>
            <tbody>
              {report.monthly.map(point => (
                <tr key={point.month} className="table-row">
                  <td className="px-3 py-2 font-medium text-slate-700">{point.month}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatBDT(point.subscription)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatBDT(point.sms)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-navy-900">{formatBDT(point.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{point.new_owners}</td>
                </tr>
              ))}
              {!loading && report.monthly.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-400">No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
