import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, Edit, Eye, RefreshCw, Search, TimerOff } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import { LiveOwner, OwnerPlan, OwnerStatus, PlanType, daysLeft, formatDate, formatLastActive, isOwnerOnline, loadOwners, planTypeLabel, registeredDays } from './superAdminLive'
import { grantTrialExtension, updateOwnerSubscription } from '../../services/admin.services'

const statusClass: Record<OwnerStatus, string> = {
  pending: 'badge-orange',
  active: 'badge-green',
  trial: 'badge-blue',
  expired: 'badge-orange',
  blocked: 'badge-red',
  suspended: 'badge-red',
}

const planOptions: OwnerPlan[] = ['Trial', 'Starter', 'Growth', 'Enterprise']
const manualPlanOptions: Array<{ value: PlanType; label: string; legacyPlan: OwnerPlan; months: number }> = [
  { value: 'monthly', label: 'Monthly', legacyPlan: 'Starter', months: 1 },
  { value: 'yearly', label: 'Yearly', legacyPlan: 'Enterprise', months: 12 },
]
const statusOptions: OwnerStatus[] = ['pending', 'active', 'suspended', 'blocked', 'expired', 'trial']

type OwnerEditForm = {
  business: string
  plan: OwnerPlan
  status: OwnerStatus
  trialEnd: string
  activeUntil: string
  blockedReason: string
}

function toInputDate(value?: string | null) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function endOfDayIso(value: string) {
  if (!value) return null
  return new Date(`${value}T23:59:59`).toISOString()
}

function addMonthsIso(months: number) {
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return date.toISOString()
}

function isMissingExpiryDateColumn(error: any) {
  const message = String(error?.message || '')
  return message.includes('expiry_date') && message.includes('owner_subscriptions') && message.includes('schema cache')
}

function withoutExpiryDate(payload: Record<string, any>) {
  const next = { ...payload }
  delete next.expiry_date
  return next
}

function daysLeftLabel(expiryDate?: string | null) {
  if (!expiryDate) return { text: '-', className: 'text-slate-500' }
  const remaining = daysLeft(expiryDate)
  if (remaining < 0) return { text: 'Expired', className: 'text-brand-red font-bold' }
  return {
    text: `${remaining} day${remaining === 1 ? '' : 's'}`,
    className: remaining <= 7 ? 'text-brand-red font-bold' : 'text-slate-700 font-semibold',
  }
}

export default function SuperAdminOwners() {
  const [owners, setOwners] = useState<LiveOwner[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | OwnerStatus>('all')
  const [loading, setLoading] = useState(true)
  const [selectedOwner, setSelectedOwner] = useState<LiveOwner | null>(null)
  const [editingOwner, setEditingOwner] = useState<LiveOwner | null>(null)
  const [editForm, setEditForm] = useState<OwnerEditForm | null>(null)
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
      toast.error(err.message || 'Failed to load owners')
    } finally {
      setLoading(false)
    }
  }

  const filteredOwners = useMemo(() => {
    const q = query.trim().toLowerCase()
    return owners.filter(owner => {
      const matchesStatus = statusFilter === 'all' || owner.effectiveStatus === statusFilter
      const matchesQuery = !q || [owner.name, owner.business, owner.email, owner.phone, owner.effectiveStatus, owner.plan].some(value =>
        String(value).toLowerCase().includes(q),
      )
      return matchesStatus && matchesQuery
    })
  }, [owners, query, statusFilter])

  function openEdit(owner: LiveOwner) {
    setEditingOwner(owner)
    setEditForm({
      business: owner.business,
      plan: owner.plan,
      status: owner.status,
      trialEnd: toInputDate(owner.trialEnd),
      activeUntil: toInputDate(owner.activeUntil),
      blockedReason: owner.blockedReason,
    })
  }

  async function updateSubscription(ownerId: string, payload: Record<string, any>, successMessage: string) {
    try {
      await updateOwnerSubscription(ownerId, payload)
    } catch (error: any) {
      toast.error(error.message)
      return
    }

    toast.success(successMessage)
    await refreshOwners()
  }

  async function activateOwner(owner: LiveOwner) {
    const expiry = new Date()
    expiry.setMonth(expiry.getMonth() + 1)
    await updateSubscription(owner.owner_id, {
      status: 'active',
      plan: owner.plan === 'Trial' ? 'Starter' : owner.plan,
      active_until: expiry.toISOString(),
      plan_type: 'monthly',
      plan_status: 'active',
      start_date: new Date().toISOString(),
      expiry_date: expiry.toISOString(),
      blocked_reason: '',
    }, 'Owner approved and activated')
  }

  async function blockOwner(owner: LiveOwner) {
    await updateSubscription(owner.owner_id, {
      status: 'blocked',
      plan_status: 'suspended',
      blocked_reason: 'Blocked by super admin',
    }, 'Owner blocked')
  }

  async function expireOwner(owner: LiveOwner) {
    const now = new Date().toISOString()
    await updateSubscription(owner.owner_id, {
      status: 'expired',
      active_until: now,
      plan_status: 'expired',
      expiry_date: now,
    }, 'Owner marked as expired')
  }

  async function grantSevenDayTrial(owner: LiveOwner) {
    try {
      await grantTrialExtension(owner.owner_id)
    } catch (error: any) {
      toast.error(error.message)
      return
    }

    toast.success('Granted +7 days trial')
    await refreshOwners()
  }

  async function changePlan(owner: LiveOwner, planType: PlanType) {
    const option = manualPlanOptions.find(item => item.value === planType)
    if (!option) return

    const now = new Date().toISOString()
    const expiry = addMonthsIso(option.months)
    await updateSubscription(owner.owner_id, {
      plan_type: option.value,
      plan_status: 'active',
      plan: option.legacyPlan,
      status: 'active',
      start_date: now,
      expiry_date: expiry,
      active_until: expiry,
      blocked_reason: '',
    }, `Plan changed to ${option.label}`)
  }

  async function saveOwner() {
    if (!editingOwner || !editForm) return

    await updateSubscription(editingOwner.owner_id, {
      business_name: editForm.business,
      plan: editForm.plan,
      status: editForm.status === 'suspended' ? 'blocked' : editForm.status,
      trial_end: endOfDayIso(editForm.trialEnd),
      active_until: endOfDayIso(editForm.activeUntil),
      plan_type: editForm.plan === 'Trial' ? 'free_trial' : 'monthly',
      plan_status: editForm.status === 'expired'
        ? 'expired'
        : (editForm.status === 'blocked' || editForm.status === 'suspended')
          ? 'suspended'
          : 'active',
      expiry_date: endOfDayIso(editForm.activeUntil) || endOfDayIso(editForm.trialEnd),
      blocked_reason: editForm.blockedReason,
    }, 'Owner subscription updated')
    setEditingOwner(null)
    setEditForm(null)
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Owner Management"
        subtitle="Control owner status, plans and account access"
        actions={
          <button onClick={refreshOwners} className="btn-secondary">
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      {setupMissing && <DatabaseSetupNotice />}

      <div className="card mb-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="input pl-9"
              placeholder="Search owner, business, email, phone or status"
            />
          </div>
          <select className="input" value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'all' | OwnerStatus)}>
            <option value="all">All statuses</option>
            {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1640px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left w-12">#</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Subscription / Duration</th>
                <th className="px-4 py-3 text-left">Last Active Status</th>
                <th className="px-4 py-3 text-left">Active Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Activation Date</th>
                <th className="px-4 py-3 text-left">Days Left</th>
                <th className="px-4 py-3 text-left">Change Plan</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOwners.map((owner, index) => {
                const remaining = daysLeftLabel(owner.expiryDate)
                const online = isOwnerOnline(owner.lastActive)
                return (
                  <tr key={owner.id} className="table-row">
                    <td className="px-4 py-3 font-medium text-slate-500">{index + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{owner.business}</p>
                      <p className="text-xs text-slate-500">{owner.name} - {owner.email}</p>
                      <p className="text-xs text-slate-400">{owner.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">Active: {registeredDays(owner.joinedAt)} Days</p>
                      <p className="text-xs text-slate-400">Since {formatDate(owner.joinedAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-2 font-semibold ${online ? 'text-brand-green' : 'text-slate-600'}`}>
                        {online && <span className="h-2 w-2 rounded-full bg-brand-green shadow-[0_0_0_3px_rgba(29,158,117,0.12)]" />}
                        {formatLastActive(owner.lastActive)}
                      </span>
                      {owner.lastActive && !online && (
                        <p className="mt-1 text-xs text-slate-400">Last seen {formatDate(owner.lastActive)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">{planTypeLabel(owner.planType)}</p>
                      <p className="text-xs text-slate-400">{formatDate(owner.expiryDate)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusClass[owner.effectiveStatus]}>{owner.effectiveStatus}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700">{formatDate(owner.startDate)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={remaining.className}>{remaining.text}</p>
                      <p className="text-xs text-slate-400">Until {formatDate(owner.expiryDate)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="input h-9 min-w-32 text-xs"
                        value={owner.planType === 'yearly' ? 'yearly' : owner.planType === 'monthly' ? 'monthly' : ''}
                        onChange={event => {
                          if (event.target.value) changePlan(owner, event.target.value as PlanType)
                        }}
                      >
                        <option value="">Change Plan</option>
                        {manualPlanOptions.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button onClick={() => grantSevenDayTrial(owner)} className="rounded-lg border border-blue-100 px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50" title="Grant exactly 7 more days">
                          Grant +7 Days Trial
                        </button>
                        <button onClick={() => setSelectedOwner(owner)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600" title="View">
                          <Eye size={15} />
                        </button>
                        <button onClick={() => openEdit(owner)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Edit">
                          <Edit size={15} />
                        </button>
                        <button onClick={() => activateOwner(owner)} className="rounded-lg p-2 text-slate-500 hover:bg-green-50 hover:text-brand-green" title="Approve">
                          <CheckCircle2 size={15} />
                        </button>
                        <button onClick={() => expireOwner(owner)} className="rounded-lg p-2 text-slate-500 hover:bg-orange-50 hover:text-orange-600" title="Mark expired">
                          <TimerOff size={15} />
                        </button>
                        <button onClick={() => blockOwner(owner)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-brand-red" title="Block">
                          <Ban size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && filteredOwners.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400">No owners found</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400">Loading owners...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={!!selectedOwner} onClose={() => setSelectedOwner(null)} title="Owner details">
        {selectedOwner && (
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Detail label="Business" value={selectedOwner.business} />
            <Detail label="Owner" value={selectedOwner.name} />
            <Detail label="Email" value={selectedOwner.email} />
            <Detail label="Phone" value={selectedOwner.phone} />
            <Detail label="Plan" value={selectedOwner.plan} />
            <Detail label="Active Plan" value={planTypeLabel(selectedOwner.planType)} />
            <Detail label="Status" value={selectedOwner.effectiveStatus} />
            <Detail label="Subscription / Duration" value={`Active: ${registeredDays(selectedOwner.joinedAt)} Days`} />
            <Detail label="Last Active Status" value={formatLastActive(selectedOwner.lastActive)} />
            <Detail label="Joined" value={formatDate(selectedOwner.joinedAt)} />
            <Detail label="Activation Date" value={formatDate(selectedOwner.startDate)} />
            <Detail label="Expiry Date" value={formatDate(selectedOwner.expiryDate)} />
            <Detail label="Days Left" value={daysLeftLabel(selectedOwner.expiryDate).text} />
            <Detail label="Blocked Reason" value={selectedOwner.blockedReason || '-'} />
          </div>
        )}
      </Modal>

      <Modal isOpen={!!editingOwner} onClose={() => { setEditingOwner(null); setEditForm(null) }} title="Edit owner subscription">
        {editingOwner && editForm && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>
                <span className="label">Business</span>
                <input className="input" value={editForm.business} onChange={event => setEditForm({ ...editForm, business: event.target.value })} />
              </label>
              <label>
                <span className="label">Plan</span>
                <select className="input" value={editForm.plan} onChange={event => setEditForm({ ...editForm, plan: event.target.value as OwnerPlan })}>
                  {planOptions.map(plan => <option key={plan} value={plan}>{plan}</option>)}
                </select>
              </label>
              <label>
                <span className="label">Status</span>
                <select className="input" value={editForm.status} onChange={event => setEditForm({ ...editForm, status: event.target.value as OwnerStatus })}>
                  {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label>
                <span className="label">Request Date</span>
                <input className="input" type="date" value={editForm.trialEnd} onChange={event => setEditForm({ ...editForm, trialEnd: event.target.value })} />
              </label>
              <label>
                <span className="label">Active Until</span>
                <input className="input" type="date" value={editForm.activeUntil} onChange={event => setEditForm({ ...editForm, activeUntil: event.target.value })} />
              </label>
              <label className="sm:col-span-2">
                <span className="label">Blocked reason</span>
                <textarea className="input min-h-20" value={editForm.blockedReason} onChange={event => setEditForm({ ...editForm, blockedReason: event.target.value })} />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditingOwner(null); setEditForm(null) }} className="btn-secondary">Cancel</button>
              <button onClick={saveOwner} className="btn-primary">Save owner</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function DatabaseSetupNotice() {
  return (
    <section className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
          <AlertTriangle size={18} />
        </div>
        <div>
          <h2 className="font-bold">Database setup pending</h2>
          <p className="mt-1">
            Supabase database-e <span className="font-semibold">owner_subscriptions</span> table missing. Migration apply korle pending registration request and approve/block live hobe.
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  )
}
