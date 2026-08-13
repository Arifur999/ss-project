import React, { useEffect, useMemo, useState } from 'react'
import { WarningIcon as AlertTriangle, EyeIcon as Eye, LockIcon as Lock, ArrowsClockwiseIcon as RefreshCw, MagnifyingGlassIcon as Search, TrashIcon as Trash2, XIcon as X } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import { resetOwnerData } from '../../services/admin.services'
import {
  LiveOwner, OwnerStatus, daysLeft, formatDate, formatLastActive, loadOwners, planTypeLabel, registeredDays,
} from './superAdminLive'

const statusClass: Record<OwnerStatus, string> = {
  pending: 'badge-orange',
  active: 'badge-green',
  trial: 'badge-blue',
  expired: 'badge-orange',
  blocked: 'badge-red',
  suspended: 'badge-red',
}

export default function SuperAdminManageOwners() {
  const [owners, setOwners] = useState<LiveOwner[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const [detail, setDetail] = useState<LiveOwner | null>(null)
  const [resetTarget, setResetTarget] = useState<LiveOwner | null>(null)
  const [password, setPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    try {
      setLoading(true)
      const result = await loadOwners()
      setOwners(result.owners)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load owners')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return owners.filter(o => !q || [o.name, o.business, o.email, o.phone, o.address].some(v => String(v || '').toLowerCase().includes(q)))
  }, [owners, query])

  function openReset(owner: LiveOwner) {
    setResetTarget(owner)
    setPassword('')
  }

  async function confirmReset() {
    if (!resetTarget) return
    if (!password.trim()) return toast.error("Enter the owner's password")
    setResetting(true)
    try {
      const result = await resetOwnerData(resetTarget.owner_id, password)
      toast.success(result.message || 'Owner data reset')
      setResetTarget(null)
      setPassword('')
      await refresh()
    } catch (err: any) {
      toast.error(err.message || 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="Manage Owners" subtitle="View every owner's details and reset a workspace to a clean slate" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, business, email, phone..." className="input pl-9" />
        </div>
        <span className="text-sm text-slate-600">Total: <b>{owners.length}</b></span>
        <button onClick={refresh} className="btn-secondary flex items-center gap-2 bg-white"><RefreshCw size={15} /> Refresh</button>
      </div>

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
          </div>
        ) : (
          <TableScroller>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="table-header">
                <tr className="whitespace-nowrap">
                  <th className="w-12 px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Owner</th>
                  <th className="px-4 py-3 text-left">Active Plan</th>
                  <th className="px-4 py-3 text-right">Days Using</th>
                  <th className="px-4 py-3 text-right">Days Left</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((owner, index) => {
                  const remaining = daysLeft(owner.expiryDate)
                  return (
                    <tr key={owner.owner_id} className="table-row">
                      <td className="px-4 py-2.5 text-slate-500">{index + 1}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-800">{owner.business || owner.name || '-'}</p>
                        <p className="text-xs text-slate-500">{owner.name} · {owner.email}</p>
                        <p className="text-xs text-slate-400">{owner.phone}</p>
                      </td>
                      <td className="px-4 py-2.5"><span className="badge-green">{planTypeLabel(owner.planType)}</span></td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-slate-700">{registeredDays(owner.joinedAt)} days</td>
                      <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${remaining < 0 ? 'text-brand-red' : remaining <= 3 ? 'text-brand-blue' : 'text-slate-700'}`}>
                        {remaining < 0 ? 'Expired' : `${remaining} days`}
                      </td>
                      <td className="px-4 py-2.5 text-center"><span className={statusClass[owner.effectiveStatus]}>{owner.effectiveStatus}</span></td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setDetail(owner)} title="View details" className="rounded-md border border-slate-200 bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200">
                            <Eye size={15} />
                          </button>
                          <button onClick={() => openReset(owner)} title="Reset / delete all data" className="rounded-md border border-red-100 bg-red-50 p-1.5 text-brand-red hover:bg-red-100">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">No owners found</td></tr>
                )}
              </tbody>
            </table>
          </TableScroller>
        )}
      </div>

      {/* Details modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950">{detail.business || detail.name}</h3>
                <span className={statusClass[detail.effectiveStatus]}>{detail.effectiveStatus}</span>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Detail label="Owner name" value={detail.name} />
              <Detail label="Business" value={detail.business} />
              <Detail label="Email" value={detail.email} />
              <Detail label="Phone" value={detail.phone} />
              <Detail label="Address" value={detail.address || '-'} full />
              <Detail label="Active plan" value={planTypeLabel(detail.planType)} />
              <Detail label="Plan status" value={detail.effectiveStatus} />
              <Detail label="Days using" value={`${registeredDays(detail.joinedAt)} days`} />
              <Detail label="Days left" value={daysLeft(detail.expiryDate) < 0 ? 'Expired' : `${daysLeft(detail.expiryDate)} days`} />
              <Detail label="Start date" value={formatDate(detail.startDate)} />
              <Detail label="Expiry date" value={formatDate(detail.expiryDate)} />
              <Detail label="Joined" value={formatDate(detail.joinedAt)} />
              <Detail label="Last active" value={formatLastActive(detail.lastActive)} />
              {detail.blockedReason ? <Detail label="Blocked reason" value={detail.blockedReason} full /> : null}
            </div>
          </div>
        </div>
      )}

      {/* Reset (password-gated) modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !resetting && setResetTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-brand-red"><AlertTriangle size={22} /></div>
              <div>
                <h3 className="text-lg font-black text-slate-950">Reset owner data</h3>
                <p className="text-xs text-slate-500">{resetTarget.business || resetTarget.name} · {resetTarget.email}</p>
              </div>
            </div>
            <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
              This permanently deletes <b>all</b> of this owner's data — products, sales, purchases, customers, suppliers, accounts, expenses, employees, loans — and gives them a clean, fresh start.
              Their account and <b>active plan stay exactly as-is</b>. This cannot be undone.
            </div>
            <label className="label" htmlFor="super-admin-manage-owners-f1">Enter the owner's password to confirm</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input id="super-admin-manage-owners-f1"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmReset() }}
                placeholder="Owner's account password"
                className="input pl-9"
                autoFocus
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setResetTarget(null)} disabled={resetting} className="btn-secondary bg-white">Cancel</button>
              <button onClick={confirmReset} disabled={resetting} className="btn-danger">
                <Trash2 size={16} /> {resetting ? 'Resetting...' : 'Confirm reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{value || '-'}</p>
    </div>
  )
}
