import React, { useEffect, useState } from 'react'
import { CheckCircle2, MessageSquareText, Package, Pencil, Plus, RefreshCcw, Trash2, Wallet, X } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import StatCard from '../../components/StatCard'
import { formatBDT } from './superAdminLive'
import {
  adminCreateSmsPackage,
  adminDeleteSmsPackage,
  adminGetSmsBalance,
  adminGetSmsPackages,
  adminGetSmsPurchases,
  adminUpdateSmsPackage,
  adminUpdateSmsPurchase,
  type SmsPackage,
  type SmsPurchase,
} from '../../services/sms.services'

const badgeClass: Record<string, string> = {
  paid: 'badge-green',
  pending: 'badge-orange',
  rejected: 'badge-red',
}

type PackageForm = { id?: string; name: string; sms_count: string; price: string; active: boolean }
const emptyForm: PackageForm = { name: '', sms_count: '', price: '', active: true }

export default function SuperAdminSms() {
  const [packages, setPackages] = useState<SmsPackage[]>([])
  const [purchases, setPurchases] = useState<SmsPurchase[]>([])
  const [balance, setBalance] = useState<{ balance: number | null; raw: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<PackageForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [pkgs, purs] = await Promise.all([adminGetSmsPackages(), adminGetSmsPurchases()])
      setPackages(pkgs || [])
      setPurchases(purs || [])
    } catch (error: any) {
      toast.error(error.message || 'Failed to load SMS data')
    } finally {
      setLoading(false)
    }
    // Balance is best-effort - the gateway may be unconfigured in dev.
    adminGetSmsBalance().then(setBalance).catch(() => setBalance(null))
  }

  function openCreate() {
    setForm(emptyForm)
    setFormOpen(true)
  }

  function openEdit(pkg: SmsPackage) {
    setForm({ id: pkg.id, name: pkg.name, sms_count: String(pkg.sms_count), price: String(Number(pkg.price)), active: pkg.active })
    setFormOpen(true)
  }

  async function savePackage() {
    const smsCount = Number(form.sms_count)
    const price = Number(form.price)
    if (!form.name.trim()) return toast.error('Enter a package name')
    if (!Number.isFinite(smsCount) || smsCount <= 0) return toast.error('Enter a valid SMS count')
    if (!Number.isFinite(price) || price < 0) return toast.error('Enter a valid price')
    setSaving(true)
    try {
      if (form.id) {
        await adminUpdateSmsPackage(form.id, { name: form.name.trim(), sms_count: smsCount, price, active: form.active })
        toast.success('Package updated')
      } else {
        await adminCreateSmsPackage({ name: form.name.trim(), sms_count: smsCount, price, active: form.active })
        toast.success('Package created')
      }
      setFormOpen(false)
      await loadAll()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save package')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(pkg: SmsPackage) {
    try {
      await adminUpdateSmsPackage(pkg.id, { active: !pkg.active })
      await loadAll()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update package')
    }
  }

  async function removePackage(pkg: SmsPackage) {
    if (!window.confirm(`Delete package "${pkg.name}"? Existing purchases keep their record.`)) return
    try {
      await adminDeleteSmsPackage(pkg.id)
      toast.success('Package deleted')
      await loadAll()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete package')
    }
  }

  async function markPurchase(id: string, statusValue: 'paid' | 'rejected') {
    setUpdatingId(id)
    try {
      await adminUpdateSmsPurchase(id, statusValue)
      toast.success(statusValue === 'paid' ? 'Approved - credits added to wallet' : 'Purchase rejected')
      await loadAll()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update purchase')
    } finally {
      setUpdatingId(null)
    }
  }

  const pendingCount = purchases.filter(p => p.status === 'pending').length
  const soldCredits = purchases.filter(p => p.status === 'paid').reduce((s, p) => s + p.sms_count, 0)
  const revenue = purchases.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="SMS Management"
        subtitle="Sell SMS credit packages and approve owner purchases"
        actions={
          <button className="btn-secondary" onClick={loadAll}>
            <RefreshCcw size={16} /> Refresh
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Gateway balance" value={balance?.balance != null ? String(balance.balance) : '—'} icon={<Wallet size={20} />} color="blue" />
        <StatCard title="Pending purchases" value={String(pendingCount)} icon={<RefreshCcw size={20} />} color="orange" />
        <StatCard title="Credits sold" value={String(soldCredits)} icon={<MessageSquareText size={20} />} color="green" />
        <StatCard title="SMS revenue" value={formatBDT(revenue)} icon={<Package size={20} />} color="green" />
      </div>

      {/* Packages */}
      <div className="card mb-6 p-0">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-base font-bold text-slate-900">SMS Packages</h2>
          <button className="btn-primary !px-3 !py-1.5 text-sm" onClick={openCreate}>
            <Plus size={16} /> Add Package
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-400">Loading...</div>
          ) : packages.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No packages yet. Add one to start selling SMS credits.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {packages.map(pkg => (
                <div key={pkg.id} className={`flex flex-col rounded-xl border p-4 ${pkg.active ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-400">{pkg.name}</span>
                    <span className={pkg.active ? 'badge-green' : 'badge-red'}>{pkg.active ? 'Active' : 'Off'}</span>
                  </div>
                  <span className="mt-2 text-2xl font-black text-slate-900">{pkg.sms_count.toLocaleString('en-US')}</span>
                  <span className="text-xs font-semibold text-slate-500">SMS credits</span>
                  <span className="mt-2 text-lg font-bold text-brand-green">{formatBDT(Number(pkg.price))}</span>
                  <div className="mt-3 flex items-center gap-2">
                    <button className="btn-secondary flex-1 justify-center !px-2 !py-1 text-xs" onClick={() => openEdit(pkg)}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => toggleActive(pkg)} title={pkg.active ? 'Deactivate' : 'Activate'}>
                      {pkg.active ? 'Hide' : 'Show'}
                    </button>
                    <button className="btn-secondary !px-2 !py-1 text-xs text-brand-red" onClick={() => removePackage(pkg)} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Purchases */}
      <div className="card overflow-hidden p-0">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-base font-bold text-slate-900">SMS Purchases</h2>
        </div>
        <TableScroller className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Package</th>
                <th className="px-4 py-3 text-right">Credits</th>
                <th className="px-4 py-3 text-left">Sender bKash No.</th>
                <th className="px-4 py-3 text-left">TrxID</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading purchases...</td></tr>
              )}
              {!loading && purchases.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No SMS purchases yet</td></tr>
              )}
              {!loading && purchases.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="px-4 py-3 font-medium text-slate-800">{p.invoice_no || p.id}</td>
                  <td className="px-4 py-3 text-slate-600">{p.owner_name || p.owner_email || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.package_name || '-'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.sms_count.toLocaleString('en-US')}</td>
                  <td className="px-4 py-3 text-slate-600">{p.sender_number || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.trx_id || '-'}</td>
                  <td className="px-4 py-3"><span className={badgeClass[p.status] || 'badge-orange'}>{p.status}</span></td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatBDT(Number(p.amount))}</td>
                  <td className="px-4 py-3 text-right">
                    {p.status === 'pending' ? (
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary !px-2 !py-1 text-xs" disabled={updatingId === p.id} onClick={() => markPurchase(p.id, 'rejected')}>Reject</button>
                        <button className="btn-primary !px-2 !py-1 text-xs" disabled={updatingId === p.id} onClick={() => markPurchase(p.id, 'paid')}>Approve</button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </div>

      {/* Package add / edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h3 className="text-lg font-bold text-slate-900">{form.id ? 'Edit Package' : 'New Package'}</h3>
              <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={() => setFormOpen(false)}><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="label">Package name</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Starter Pack" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">SMS count</label>
                  <input className="input" type="number" value={form.sms_count} onChange={e => setForm({ ...form, sms_count: e.target.value })} placeholder="500" />
                </div>
                <div>
                  <label className="label">Price (Tk)</label>
                  <input className="input" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="400" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />
                Active (visible to owners)
              </label>
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-5">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="btn-primary flex-1 justify-center disabled:opacity-60" disabled={saving} onClick={savePackage}>
                <CheckCircle2 size={16} /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
