import React, { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowsClockwiseIcon as RefreshCw, CreditCardIcon as CreditCard, DownloadSimpleIcon as Download, HourglassIcon as Hourglass, SparkleIcon as Sparkles, TrendUpIcon as TrendingUp, UsersIcon as Users, WarningIcon as Warning } from '@phosphor-icons/react'
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
  monthly_revenue: number
  yearly_revenue: number
  other_plan_revenue: number
  sms_purchase_count: number
  pending_amount: number
  pending_count: number
  total_owners: number
  active_subscriptions: number
  on_trial: number
  granted_access: number
  churned: number
  never_started: number
  monthly: MonthlyPoint[]
}

const EMPTY_REPORT: PlatformReport = {
  subscription_revenue: 0,
  sms_revenue: 0,
  total_revenue: 0,
  monthly_revenue: 0,
  yearly_revenue: 0,
  other_plan_revenue: 0,
  sms_purchase_count: 0,
  pending_amount: 0,
  pending_count: 0,
  total_owners: 0,
  active_subscriptions: 0,
  on_trial: 0,
  granted_access: 0,
  churned: 0,
  never_started: 0,
  monthly: [],
}

const money = (value: unknown) => Number(value) || 0
const count = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0))

/**
 * Takes only what each field is supposed to be.
 *
 * Spreading the response over the defaults guards a null body but not a null
 * field: one `monthly: null` from a serialisation change or an error envelope
 * replaced the safe [] and the next .map() white-screened the page. Nothing
 * here can produce anything but a number or an array.
 */
function normalise(data: any): PlatformReport {
  const raw = data && typeof data === 'object' ? data : {}
  const monthly = Array.isArray(raw.monthly) ? raw.monthly : []
  return {
    subscription_revenue: money(raw.subscription_revenue),
    sms_revenue: money(raw.sms_revenue),
    total_revenue: money(raw.total_revenue),
    monthly_revenue: money(raw.monthly_revenue),
    yearly_revenue: money(raw.yearly_revenue),
    other_plan_revenue: money(raw.other_plan_revenue),
    sms_purchase_count: count(raw.sms_purchase_count),
    pending_amount: money(raw.pending_amount),
    pending_count: count(raw.pending_count),
    total_owners: count(raw.total_owners),
    active_subscriptions: count(raw.active_subscriptions),
    on_trial: count(raw.on_trial),
    granted_access: count(raw.granted_access),
    churned: count(raw.churned),
    never_started: count(raw.never_started),
    monthly: monthly.map((point: any) => ({
      month: String(point?.month ?? ''),
      subscription: money(point?.subscription),
      sms: money(point?.sms),
      revenue: money(point?.revenue),
      new_owners: count(point?.new_owners),
    })),
  }
}

/**
 * The axis label for a takings figure.
 *
 * Not a hard divide by 1000. This page reports subscription income, which
 * starts at one Tk 599 payment - at that scale every tick rendered as "৳0k",
 * an axis that cannot be read for exactly the amounts it now shows. The
 * thousands suffix earns its place only once the numbers are in thousands.
 */
function axisTick(value: number) {
  const amount = Number(value) || 0
  if (Math.abs(amount) >= 100000) return `৳${Math.round(amount / 1000)}k`
  return `৳${amount.toLocaleString('en-BD')}`
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
  // Whether these figures are the server's answer. Until they are, no number on
  // this page is shown: a zero here is a real answer - the commit that rewrote
  // this page said to expect low figures - so rendering the defaults during a
  // load or after a failure makes a broken endpoint read as a true nil.
  const [answered, setAnswered] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    setLoading(true)
    setFailed(false)
    try {
      const data = await getSuperAdminReports()
      setReport(normalise(data))
      setAnswered(true)
    } catch (error: any) {
      setAnswered(false)
      setFailed(true)
      toast.error(error.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  // Every figure goes through here, so none of them can be shown before it is
  // known.
  const cash = (value: number) => (answered ? formatBDT(value) : '—')
  const num = (value: number) => (answered ? String(value) : '—')

  function downloadCsv() {
    const lines = [
      'Month,Subscription,SMS,Total revenue,New businesses',
      ...report.monthly.map(point =>
        `${point.month},${point.subscription},${point.sms},${point.revenue},${point.new_owners}`),
      '',
      `Subscription revenue,${report.subscription_revenue}`,
      `SMS revenue,${report.sms_revenue}`,
      `Total revenue,${report.total_revenue}`,
      `Awaiting approval,${report.pending_amount}`,
      `Businesses signed up,${report.total_owners}`,
      `Paying,${report.active_subscriptions}`,
      `On free trial,${report.on_trial}`,
      `Access granted without payment,${report.granted_access}`,
      `Churned,${report.churned}`,
      `Never started,${report.never_started}`,
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
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={loadReport} disabled={loading}>
              <RefreshCw size={16} />
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button className="btn-primary" onClick={downloadCsv} disabled={!answered}>
              <Download size={16} />
              Download report
            </button>
          </div>
        }
      />

      {failed && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface px-4 py-3">
          <p className="flex items-start gap-1.5 text-sm text-brand-red">
            <Warning size={16} weight="duotone" className="mt-px shrink-0" />
            <span>The report could not be loaded, so no figures are shown - none of these are zero, they are unknown.</span>
          </p>
          <button className="btn-secondary" onClick={loadReport}>
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      )}

      {/* Money that actually reached us. Pending sits beside it rather than
          inside it - it has been sent, but it is not income until approved. */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total revenue" value={cash(report.total_revenue)} icon={<TrendingUp size={20} />} color="green" />
        <StatCard title="Subscriptions" value={cash(report.subscription_revenue)} icon={<CreditCard size={20} />} color="blue" />
        <StatCard title="SMS packages" value={cash(report.sms_revenue)} icon={<Sparkles size={20} />} color="blue" />
        <StatCard title="Awaiting approval" value={cash(report.pending_amount)} icon={<Hourglass size={20} />} color="orange" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Businesses signed up" value={num(report.total_owners)} icon={<Users size={20} />} color="blue" />
        <StatCard title="Paying now" value={num(paying)} icon={<CreditCard size={20} />} color="green" />
        <StatCard title="On free trial" value={num(report.on_trial)} icon={<Sparkles size={20} />} color="orange" />
        <StatCard title="Churned" value={num(report.churned)} icon={<Hourglass size={20} />} color="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h2 className="mb-1 font-semibold text-slate-800">Revenue, month by month</h2>
          <p className="mb-4 text-xs text-slate-500">Subscriptions and SMS packages, counted on the day the payment was approved.</p>
          {loading || !answered ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">
              {loading ? 'Loading chart...' : 'No figures to draw'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={report.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={axisTick} width={72} />
                <Tooltip formatter={(value: number) => formatBDT(value)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* Stacked, because the two together are the month's income and
                    the split is the second thing worth knowing about it.
                    No corner radius: it can only go on one segment, and in a
                    month with no SMS that segment has no height, so the bars
                    would be rounded or square depending on the month. */}
                <Bar dataKey="subscription" stackId="revenue" fill="#0F1117" name="Subscriptions" />
                <Bar dataKey="sms" stackId="revenue" fill="#22C55E" name="SMS packages" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="card">
            <h2 className="mb-2 font-semibold text-slate-800">Where the money comes from</h2>
            <Row label="Monthly plans" value={cash(report.monthly_revenue)} note={answered ? 'approved payments' : undefined} />
            <Row label="Yearly plans" value={cash(report.yearly_revenue)} note={answered ? 'approved payments' : undefined} />
            {/* Only when there is something the two plans above do not account
                for, so the panel always adds up to the headline. */}
            {answered && report.other_plan_revenue !== 0 && (
              <Row label="Other plans" value={cash(report.other_plan_revenue)} />
            )}
            <Row label="SMS packages" value={cash(report.sms_revenue)} note={answered ? `${report.sms_purchase_count} purchases` : undefined} />
            <Row label="Awaiting approval" value={cash(report.pending_amount)} note={answered ? `${report.pending_count} waiting - plans and SMS` : undefined} />
          </div>

          <div className="card">
            <h2 className="mb-2 font-semibold text-slate-800">How the businesses split</h2>
            <Row label="Signed up" value={num(report.total_owners)} />
            <Row label="Paying" value={num(paying)} note={answered ? `${conversion.toFixed(1)}% of everyone who signed up` : undefined} />
            <Row label="On free trial" value={num(report.on_trial)} />
            <Row label="Access granted, unpaid" value={num(report.granted_access)} note={answered ? 'plan set by hand' : undefined} />
            <Row label="Churned" value={num(report.churned)} note={answered ? 'paid before, not active now' : undefined} />
            <Row label="Never started" value={num(report.never_started)} note={answered ? 'signed up, no trial, no payment' : undefined} />
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
              {answered && report.monthly.map(point => (
                <tr key={point.month} className="table-row">
                  <td className="px-3 py-2 font-medium text-slate-700">{point.month}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatBDT(point.subscription)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatBDT(point.sms)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-navy-900">{formatBDT(point.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{point.new_owners}</td>
                </tr>
              ))}
              {(!answered || report.monthly.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-400">
                    {loading ? 'Loading...' : answered ? 'No data yet' : 'Not loaded'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Said on the page, because the figure above cannot show it: the payment
          rows these totals are built from are removed with their owner, so
          deleting a customer takes their history out of the lifetime numbers. */}
      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Revenue counts approved payments from customers who are still on the system. Deleting a customer removes their
        payment history with them, so these lifetime totals fall by whatever they had paid.
      </p>
    </div>
  )
}
