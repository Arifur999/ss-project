import React, { useEffect, useMemo, useState } from 'react'
import { Ban, CheckCircle2, RefreshCw, Search, TimerReset } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import { confirmAction } from '../../components/ConfirmDialog'
import { LiveOwner, OwnerStatus, daysLeft, formatDate, loadOwners } from './superAdminLive'
import { grantTrialExtension, updateOwnerSubscription } from '../../services/admin.services'

const statusClass: Record<OwnerStatus, string> = {
  pending: 'badge-orange',
  active: 'badge-green',
  trial: 'badge-blue',
  expired: 'badge-orange',
  blocked: 'badge-red',
  suspended: 'badge-red',
}

// Super-admin "Free Trial" page: everyone who is on (or started) the free
// trial, with their captured contact info and quick moderation actions.
export default function SuperAdminFreeTrial() {
  const [owners, setOwners] = useState<LiveOwner[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    try {
      setLoading(true)
      const result = await loadOwners()
      setOwners(result.owners)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load free-trial users')
    } finally {
      setLoading(false)
    }
  }

  const trialOwners = useMemo(() => {
    const q = query.trim().toLowerCase()
    return owners
      .filter(owner => owner.planType === 'free_trial')
      .filter(owner => !q || [owner.name, owner.email, owner.phone, owner.address, owner.business].some(v => String(v).toLowerCase().includes(q)))
  }, [owners, query])

  async function runAction(ownerId: string, payload: Record<string, any>, successMessage: string) {
    setBusyId(ownerId)
    try {
      await updateOwnerSubscription(ownerId, payload)
      toast.success(successMessage)
      await refresh()
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  async function banOwner(owner: LiveOwner) {
    if (!(await confirmAction({ message: `Ban ${owner.name}? They will lose access until unbanned.` }))) return
    await runAction(owner.owner_id, { status: 'blocked', plan_status: 'suspended', blocked_reason: 'Banned by super admin' }, 'User banned')
  }

  async function unbanOwner(owner: LiveOwner) {
    const now = new Date().toISOString()
    await runAction(owner.owner_id, { status: 'active', plan_status: 'active', blocked_reason: '', expiry_date: owner.expiryDate || now }, 'User unbanned')
  }

  async function extendTrial(owner: LiveOwner) {
    setBusyId(owner.owner_id)
    try {
      await grantTrialExtension(owner.owner_id)
      toast.success('Granted +7 days trial')
      await refresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to grant trial')
    } finally {
      setBusyId(null)
    }
  }

  const activeCount = trialOwners.filter(o => o.effectiveStatus === 'active').length

  return (
    <div className="p-6">
      <PageHeader title="Free Trial" subtitle="Owners who started the 7-day free trial" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, email, phone, address..."
            className="input pl-9"
          />
        </div>
        <span className="text-sm text-slate-600">Total: <b>{trialOwners.length}</b> · Active: <b className="text-brand-green">{activeCount}</b></span>
        <button onClick={refresh} className="btn-secondary bg-white flex items-center gap-2"><RefreshCw size={15} /> Refresh</button>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-4 border-brand-green border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="w-full text-sm min-w-[980px]">
            <thead className="table-header">
              <tr className="whitespace-nowrap">
                <th className="text-left py-3 px-4 w-12">#</th>
                <th className="text-left py-3 px-4">Name</th>
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Phone</th>
                <th className="text-left py-3 px-4">Address</th>
                <th className="text-left py-3 px-4">Trial Start</th>
                <th className="text-right py-3 px-4">Days Left</th>
                <th className="text-center py-3 px-4">Status</th>
                <th className="text-center py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trialOwners.map((owner, index) => {
                const remaining = daysLeft(owner.expiryDate)
                const isBanned = owner.effectiveStatus === 'blocked' || owner.effectiveStatus === 'suspended'
                return (
                  <tr key={owner.owner_id} className="table-row">
                    <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{owner.name}</td>
                    <td className="py-2.5 px-4 text-slate-600">{owner.email}</td>
                    <td className="py-2.5 px-4 text-slate-600">{owner.phone}</td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-[220px] truncate" title={owner.address}>{owner.address}</td>
                    <td className="py-2.5 px-4 text-slate-600">{formatDate(owner.trialStart)}</td>
                    <td className={`py-2.5 px-4 text-right font-semibold ${remaining < 0 ? 'text-brand-red' : remaining <= 2 ? 'text-orange-600' : 'text-slate-700'}`}>
                      {remaining < 0 ? 'Expired' : `${remaining} day${remaining === 1 ? '' : 's'}`}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={statusClass[owner.effectiveStatus]}>{owner.effectiveStatus}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => extendTrial(owner)}
                          disabled={busyId === owner.owner_id}
                          title="Grant +7 days trial"
                          className="rounded-md border border-blue-100 bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                        >
                          <TimerReset size={14} />
                        </button>
                        {isBanned ? (
                          <button
                            onClick={() => unbanOwner(owner)}
                            disabled={busyId === owner.owner_id}
                            title="Unban"
                            className="rounded-md border border-green-100 bg-green-50 p-1.5 text-brand-green hover:bg-green-100 disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => banOwner(owner)}
                            disabled={busyId === owner.owner_id}
                            title="Ban"
                            className="rounded-md border border-red-100 bg-red-50 p-1.5 text-brand-red hover:bg-red-100 disabled:opacity-50"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {trialOwners.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">No free-trial users yet</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
