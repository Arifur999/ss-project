import React, { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Ban, CheckCircle2, CreditCard, RefreshCw, ShieldCheck, TimerOff, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { LiveOwner, OwnerStatus, daysLeft, formatDate, loadOwners } from './superAdminLive'
import { supabase } from '../../lib/supabase'

function isMissingExpiryDateColumn(error: any) {
  const message = String(error?.message || '')
  return message.includes('expiry_date') && message.includes('owner_subscriptions') && message.includes('schema cache')
}

function withoutExpiryDate(payload: Record<string, any>) {
  const next = { ...payload }
  delete next.expiry_date
  return next
}

const statusClass: Record<OwnerStatus, string> = {
  pending: 'badge-orange',
  active: 'badge-green',
  trial: 'badge-blue',
  expired: 'badge-orange',
  blocked: 'badge-red',
  suspended: 'badge-red',
}

const statusColors: Record<OwnerStatus, string> = {
  pending: '#f59e0b',
  active: '#1D9E75',
  trial: '#2563eb',
  expired: '#f59e0b',
  blocked: '#E24B4A',
  suspended: '#E24B4A',
}

export default function SuperAdminDashboard() {
  const [owners, setOwners] = useState<LiveOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [setupMissing, setSetupMissing] = useState(false)

  useEffect(() => {
    refreshOwners()
  }, [])

  async function refreshOwners() {
    try {
      setLoading(true)
      const result = await loadOwners()
      setOwners(result.owners)
      setSetupMissing(result.setupMissing)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load super admin data')
    } finally {
      setLoading(false)
    }
  }

  async function updateOwnerStatus(owner: LiveOwner, status: 'active' | 'blocked') {
    if (setupMissing) {
      toast.error('Apply the Supabase owner subscription migration first')
      return
    }

    const now = new Date()
    const expiry = new Date(now)
    expiry.setMonth(expiry.getMonth() + 1)

    const payload = {
      status,
      plan: owner.plan === 'Trial' ? 'Starter' : owner.plan,
      active_until: status === 'active' ? expiry.toISOString() : owner.activeUntil,
      plan_type: status === 'active' ? 'monthly' : owner.planType,
      plan_status: status === 'active' ? 'active' : 'suspended',
      start_date: status === 'active' ? now.toISOString() : owner.startDate,
      expiry_date: status === 'active' ? expiry.toISOString() : owner.expiryDate,
      blocked_reason: status === 'blocked' ? 'Blocked by super admin' : '',
      updated_at: new Date().toISOString(),
    }

    let { error } = await supabase
      .from('owner_subscriptions')
      .update(payload)
      .eq('owner_id', owner.owner_id)

    if (error && isMissingExpiryDateColumn(error)) {
      const retry = await supabase
        .from('owner_subscriptions')
        .update(withoutExpiryDate(payload))
        .eq('owner_id', owner.owner_id)
      error = retry.error
    }

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(status === 'active' ? 'Owner approved' : 'Owner blocked')
    await refreshOwners()
  }

  const summary = useMemo(() => {
    const count = (status: OwnerStatus) => owners.filter(owner => owner.effectiveStatus === status).length
    const expiringSoon = owners.filter(owner => {
      const remaining = daysLeft(owner.activeUntil)
      return owner.effectiveStatus === 'active' && Boolean(owner.activeUntil) && remaining >= 0 && remaining <= 7
    }).length

    return {
      total: owners.length,
      pending: count('pending'),
      active: count('active'),
      expired: count('expired'),
      blocked: count('blocked'),
      expiringSoon,
    }
  }, [owners])

  const statusChart = (['pending', 'active', 'expired', 'blocked'] as OwnerStatus[]).map(status => ({
    name: status,
    value: owners.filter(owner => owner.effectiveStatus === status).length,
    color: statusColors[status],
  }))

  const pendingOwners = owners.filter(owner => owner.effectiveStatus === 'pending').slice(0, 8)
  const recentOwners = owners.slice(0, 8)
  const expiringOwners = owners
    .filter(owner => owner.effectiveStatus === 'active' && Boolean(owner.activeUntil))
    .sort((a, b) => {
      const aDate = new Date(a.effectiveStatus === 'active' ? a.activeUntil || a.trialEnd : a.trialEnd).getTime()
      const bDate = new Date(b.effectiveStatus === 'active' ? b.activeUntil || b.trialEnd : b.trialEnd).getTime()
      return aDate - bDate
    })
    .slice(0, 8)

  const cards = [
    { title: 'Total Owners', value: String(summary.total), hint: 'Registered owner accounts', icon: <Users size={18} />, tone: 'blue' },
    { title: 'Pending Requests', value: String(summary.pending), hint: 'Waiting for approval', icon: <Users size={18} />, tone: 'orange' },
    { title: 'Active Owners', value: String(summary.active), hint: 'Approved owner accounts', icon: <ShieldCheck size={18} />, tone: 'green' },
    { title: 'Blocked Owners', value: String(summary.blocked), hint: 'Manually blocked access', icon: <TimerOff size={18} />, tone: 'red' },
    { title: 'Expired Owners', value: String(summary.expired), hint: `${summary.expiringSoon} expiring soon`, icon: <CreditCard size={18} />, tone: 'orange' },
  ]

  const toneClass: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-green">Super Admin</p>
          <h1 className="text-2xl font-bold text-slate-900">Platform Control Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500">Registration requests, owner approval and account access</p>
        </div>
        <button onClick={refreshOwners} className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <RefreshCw size={16} className="text-blue-600" />
          Refresh
        </button>
      </div>

      <main className="space-y-4">
        {setupMissing && <DatabaseSetupNotice />}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(card => (
            <div key={card.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass[card.tone]}`}>{card.icon}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-bold text-slate-800">Owner Status</h2>
              <p className="text-xs text-slate-500">Live subscription status distribution</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                  {statusChart.map(item => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Status Counts</h2>
                <p className="text-xs text-slate-500">Pending, active, expired and blocked owners</p>
              </div>
              <CreditCard size={17} className="text-brand-green" />
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name="Owners" radius={[4, 4, 0, 0]}>
                  {statusChart.map(item => <Cell key={item.name} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <OwnerTable
          title="Pending Registration Requests"
          subtitle="Approve requests before customers can use the software"
          owners={pendingOwners}
          loading={loading}
          showActions
          onApprove={owner => updateOwnerStatus(owner, 'active')}
          onBlock={owner => updateOwnerStatus(owner, 'blocked')}
        />

        <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          <OwnerTable title="Recent Owners" subtitle="Newest registered owner workspaces" owners={recentOwners} loading={loading} />
          <OwnerTable title="Expiring Soon" subtitle="Active subscriptions nearest to expiry" owners={expiringOwners} loading={loading} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Owner Access Control</h2>
              <p className="text-xs text-slate-500">Manage approvals, block actions and expiry from Owner Management.</p>
            </div>
            <Link to="/super-admin/owners" className="btn-primary w-fit">Manage owners</Link>
          </div>
        </section>
      </main>
    </div>
  )
}

function DatabaseSetupNotice() {
  return (
    <section className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
          <AlertTriangle size={18} />
        </div>
        <div>
          <h2 className="font-bold">Database setup pending</h2>
          <p className="mt-1">
            Supabase database-e <span className="font-semibold">owner_subscriptions</span> table ekhono create hoyni.
            Owner approval system chalate migrations apply korte hobe.
          </p>
          <p className="mt-2 text-xs text-orange-800">
            Apply in order: 20260609120000_owner_registration_trials.sql, 20260609123000_disable_owner_trial.sql,
            20260609124500_owner_approval_requests.sql, then 20260609130000_configure_super_admin_profile.sql.
          </p>
        </div>
      </div>
    </section>
  )
}

function OwnerTable({
  title,
  subtitle,
  owners,
  loading,
  showActions = false,
  onApprove,
  onBlock,
}: {
  title: string
  subtitle: string
  owners: LiveOwner[]
  loading: boolean
  showActions?: boolean
  onApprove?: (owner: LiveOwner) => void
  onBlock?: (owner: LiveOwner) => void
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="badge-blue">{owners.length} owners</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left">Owner</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Request Date</th>
              <th className="px-4 py-3 text-left">Active Until</th>
              {showActions && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {owners.map(owner => (
              <tr key={`${title}-${owner.id}`} className="table-row">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-800">{owner.business}</p>
                  <p className="text-xs text-slate-500">{owner.name} - {owner.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{owner.plan}</td>
                <td className="px-4 py-3"><span className={statusClass[owner.effectiveStatus]}>{owner.effectiveStatus}</span></td>
                <td className="px-4 py-3 text-slate-600">{formatDate(owner.joinedAt)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(owner.activeUntil)}</td>
                {showActions && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => onApprove?.(owner)} className="rounded-lg p-2 text-slate-500 hover:bg-green-50 hover:text-brand-green" title="Approve">
                        <CheckCircle2 size={15} />
                      </button>
                      <button onClick={() => onBlock?.(owner)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-brand-red" title="Block">
                        <Ban size={15} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!loading && owners.length === 0 && (
              <tr><td colSpan={showActions ? 6 : 5} className="py-10 text-center text-slate-400">No owners found</td></tr>
            )}
            {loading && (
              <tr><td colSpan={showActions ? 6 : 5} className="py-10 text-center text-slate-400">Loading owners...</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
