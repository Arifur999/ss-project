import React, { useEffect, useMemo, useState } from 'react'
import { ProhibitIcon as Ban, CalendarCheckIcon as CalendarClock, ArrowsClockwiseIcon as RefreshCw, MagnifyingGlassIcon as Search, ClockCounterClockwiseIcon as TimerReset, UsersIcon as Users, WalletIcon as Wallet } from '@phosphor-icons/react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import { confirmAction } from '../../components/ConfirmDialog'
import { getActiveCustomers, updateOwnerSubscription } from '../../services/admin.services'
import { formatDate as formatDateUtil } from '../../lib/utils'

type PaidCustomer = {
  id: string
  email: string
  full_name: string
  phone: string
  business_name: string
  plan: string
  plan_type: string
  status: string
  start_date: string | null
  expiry_date: string | null
  days_left: number | null
  last_paid_amount: number
  total_paid: number
  paid_count: number
  is_active: boolean
}

const money = (n: number) => 'Tk ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const formatDate = (value: string | null) => formatDateUtil(value) || '-'
const planLabel = (planType: string) => (planType === 'yearly' ? 'Yearly' : planType === 'monthly' ? 'Monthly' : planType || '-')

export default function SuperAdminActiveCustomers() {
  const [customers, setCustomers] = useState<PaidCustomer[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    try {
      setLoading(true)
      const data = await getActiveCustomers()
      setCustomers(Array.isArray(data) ? data : [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load active customers')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers.filter(c => !q || [c.business_name, c.full_name, c.email, c.phone].some(v => String(v || '').toLowerCase().includes(q)))
  }, [customers, query])

  const totalRevenue = useMemo(() => customers.reduce((sum, c) => sum + Number(c.total_paid || 0), 0), [customers])
  const expiringSoon = useMemo(() => customers.filter(c => c.days_left !== null && c.days_left <= 7).length, [customers])

  // Chart: number of active customers per plan.
  const planChart = useMemo(() => {
    const monthly = customers.filter(c => c.plan_type === 'monthly').length
    const yearly = customers.filter(c => c.plan_type === 'yearly').length
    const other = customers.length - monthly - yearly
    const rows = [
      { name: 'Monthly', value: monthly, color: '#0b0b0f' },
      { name: 'Yearly', value: yearly, color: '#1D9E75' },
    ]
    if (other > 0) rows.push({ name: 'Other', value: other, color: '#94a3b8' })
    return rows
  }, [customers])

  async function extend(customer: PaidCustomer) {
    setBusyId(customer.id)
    try {
      const base = new Date(Math.max(Date.now(), customer.expiry_date ? new Date(customer.expiry_date).getTime() : 0))
      base.setDate(base.getDate() + 30)
      await updateOwnerSubscription(customer.id, {
        expiry_date: base.toISOString(),
        active_until: base.toISOString(),
        status: 'active',
        plan_status: 'active',
        blocked_reason: '',
      })
      toast.success('Extended by 30 days')
      await refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to extend')
    } finally {
      setBusyId(null)
    }
  }

  async function ban(customer: PaidCustomer) {
    if (!(await confirmAction({ message: `Block ${customer.business_name || customer.full_name}? They will lose access until unblocked.` }))) return
    setBusyId(customer.id)
    try {
      await updateOwnerSubscription(customer.id, { status: 'blocked', plan_status: 'suspended', blocked_reason: 'Blocked by super admin' })
      toast.success('Customer blocked')
      await refresh()
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="Active Customers" subtitle="Owners on a paid plan whose subscription is still active" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<Users size={20} />} label="Active Customers" value={String(customers.length)} />
        <StatCard icon={<Wallet size={20} />} label="Total Revenue" value={money(totalRevenue)} tone="green" />
        <StatCard icon={<CalendarClock size={20} />} label="Expiring in ≤ 7 days" value={String(expiringSoon)} tone={expiringSoon > 0 ? 'orange' : 'default'} />
      </div>

      <div className="mb-4 card">
        <h2 className="mb-3 text-sm font-bold text-slate-800">Active customers by plan</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={planChart} margin={{ top: 20, right: 12, left: 4, bottom: 4 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
            <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={90}>
              {planChart.map(entry => <Cell key={entry.name} fill={entry.color} />)}
              <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#0f172a' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by business, name, email, phone..." className="input pl-9" />
        </div>
        <button onClick={refresh} className="btn-secondary flex items-center gap-2 bg-white"><RefreshCw size={15} /> Refresh</button>
      </div>

      <TableScroller wrapClassName="card p-0" className="overflow-x-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
          </div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="table-header">
              <tr className="whitespace-nowrap">
                <th className="w-12 px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-right">Amount Paid</th>
                <th className="px-4 py-3 text-left">Expiry</th>
                <th className="px-4 py-3 text-right">Days Left</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer, index) => {
                const days = customer.days_left ?? 0
                return (
                  <tr key={customer.id} className="table-row">
                    <td className="px-4 py-2.5 text-slate-500">{index + 1}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-slate-800">{customer.business_name || customer.full_name || '-'}</p>
                      <p className="text-xs text-slate-500">{customer.full_name} · {customer.email}</p>
                      <p className="text-xs text-slate-400">{customer.phone}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="badge-green">{planLabel(customer.plan_type)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-brand-green">{money(customer.last_paid_amount)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatDate(customer.expiry_date)}</td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${days <= 2 ? 'text-brand-red' : days <= 7 ? 'text-brand-blue' : 'text-slate-700'}`}>
                      {days} day{days === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => extend(customer)} disabled={busyId === customer.id} title="Extend +30 days" className="rounded-md border border-slate-200 bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200 disabled:opacity-50">
                          <TimerReset size={14} />
                        </button>
                        <button onClick={() => ban(customer)} disabled={busyId === customer.id} title="Block" className="rounded-md border border-red-100 bg-red-50 p-1.5 text-brand-red hover:bg-red-100 disabled:opacity-50">
                          <Ban size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">No active paid customers yet</td></tr>
              )}
            </tbody>
          </table>
        )}
      </TableScroller>
    </div>
  )
}

function StatCard({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: string; tone?: 'default' | 'green' | 'orange' }) {
  const valueColor = tone === 'green' ? 'text-brand-green' : tone === 'orange' ? 'text-brand-blue' : 'text-slate-900'
  return (
    <div className="card flex items-center gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-0.5 text-xl font-bold ${valueColor}`}>{value}</p>
      </div>
    </div>
  )
}
