import React, { useEffect, useState } from 'react'
import { PencilSimpleIcon as Pencil, PlusIcon as Plus, FloppyDiskIcon as Save, TrashIcon as Trash2 } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import TableScroller from '../../components/TableScroller'
import { confirmAction } from '../../components/ConfirmDialog'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { monthKey, targetCompletion } from '../../lib/purchaseRollingTarget'

/**
 * How much to buy from one supplier over a stretch of months.
 *
 * The month count and the per-month figure are worked out here rather than
 * stored: they follow from the start and the end, and a stored copy could only
 * ever end up disagreeing with them after an edit.
 */
export function monthsInRange(target: {
  start_year: number; start_month: number; end_year: number; end_month: number
}) {
  const start = Number(target.start_year) * 12 + Number(target.start_month)
  const end = Number(target.end_year) * 12 + Number(target.end_month)
  // Inclusive of both ends: Jan to Jan is one month, not zero.
  return Math.max(0, end - start + 1)
}

export function perMonthAmount(total: number, months: number) {
  return months > 0 ? Number(total || 0) / months : 0
}

export default function PurchaseTarget() {
  const { t, formatCurr, formatNum, monthShort } = useLang()
  const { profile } = useAuth()
  const [targets, setTargets] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  // Bought per supplier per month, so a target can say how far it got. Kept
  // separate from the targets because one supplier can have several.
  const [boughtBySupplier, setBoughtBySupplier] = useState<Record<string, Record<string, number>>>({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [targetRes, supplierRes, purchaseRes] = await Promise.all([
        supabase.from('purchase_targets').select('*'),
        supabase.from('suppliers').select('id, name, company_name').eq('is_active', true).order('company_name'),
        // Not date filtered: a target can run over any months, including ones
        // long past, and the completion figure has to cover all of them.
        supabase.from('purchases').select('date, supplier_id, total_amount, net_amount, purchase_items(total_amount)'),
      ])
      if (targetRes.error) throw targetRes.error
      setTargets(targetRes.data || [])
      setSuppliers(supplierRes.data || [])

      const bought: Record<string, Record<string, number>> = {}
      ;(purchaseRes.error ? [] : purchaseRes.data || []).forEach((purchase: any) => {
        if (!purchase.supplier_id || !purchase.date) return
        const when = new Date(`${String(purchase.date).slice(0, 10)}T12:00:00`)
        const key = monthKey(when.getFullYear(), when.getMonth() + 1)
        const items = (purchase.purchase_items || []).reduce((sum: number, item: any) => sum + Number(item.total_amount || 0), 0)
        const value = items || Number(purchase.total_amount || purchase.net_amount || 0)
        const perSupplier = bought[purchase.supplier_id] || (bought[purchase.supplier_id] = {})
        perSupplier[key] = (perSupplier[key] || 0) + value
      })
      setBoughtBySupplier(bought)
    } catch (error: any) {
      toast.error(error.message || t('common_error'))
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({ message: t('common_confirmDelete') }))) return
    const { error } = await supabase.from('purchase_targets').delete().eq('id', id)
    if (error) return toast.error(error.message || t('common_error'))
    toast.success(t('common_deleted'))
    load()
  }

  const companyOf = (target: any) => {
    const supplier = target.supplier || suppliers.find(s => s.id === target.supplier_id)
    return supplier?.company_name || supplier?.name || ''
  }

  const monthLabel = (month: number, year: number) => `${monthShort(Number(month))} ${year}`

  return (
    <div className="min-h-screen bg-white p-6">
      <PageHeader title={t('nav_purchaseTarget')} subtitle={t('purchaseTarget_subtitle')} />

      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="font-semibold text-slate-800">{t('purchaseTarget_listTitle')} ({targets.length})</h2>
          <button onClick={() => { setEditing(null); setShowModal(true) }} className="btn-primary">
            <Plus size={16} /> {t('purchaseTarget_add')}
          </button>
        </div>

        <TableScroller>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-2.5 text-left">#</th>
                <th className="px-4 py-2.5 text-left">{t('purchaseTarget_company')}</th>
                <th className="px-4 py-2.5 text-left">{t('purchaseTarget_start')}</th>
                <th className="px-4 py-2.5 text-left">{t('purchaseTarget_end')}</th>
                <th className="px-4 py-2.5 text-right">{t('purchaseTarget_total')}</th>
                <th className="px-4 py-2.5 text-right">{t('purchaseTarget_months')}</th>
                <th className="px-4 py-2.5 text-right">{t('purchaseTarget_perMonth')}</th>
                <th className="px-4 py-2.5 text-right">{t('purchaseTarget_complete')}</th>
                <th className="px-4 py-2.5 text-right">{t('common_action')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">{t('common_loading')}</td></tr>
              )}
              {!loading && targets.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">{t('common_noData')}</td></tr>
              )}
              {!loading && targets.map((target, index) => {
                const months = monthsInRange(target)
                const done = targetCompletion(target, boughtBySupplier[target.supplier_id] || {})
                return (
                  <tr key={target.id} className="table-row">
                    <td className="px-4 py-2.5 text-slate-500">{index + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-navy-900">{companyOf(target)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{monthLabel(target.start_month, target.start_year)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{monthLabel(target.end_month, target.end_year)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-navy-900">{formatCurr(target.total_amount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{formatNum(months)}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-brand-green">
                      {formatCurr(perMonthAmount(target.total_amount, months))}
                    </td>
                    {/* The figure that still means something once the period is
                        over and the month-by-month rolling has nothing left to
                        say - how much of the target was actually bought. */}
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-200">
                          <div
                            className={`h-full rounded-full ${done.percent >= 100 ? 'bg-brand-green' : done.finished ? 'bg-brand-red' : 'bg-brand-blue'}`}
                            style={{ width: `${Math.min(100, done.percent)}%` }}
                          />
                        </div>
                        <span
                          className={`w-14 text-right font-semibold tabular-nums ${done.percent >= 100 ? 'text-brand-green' : done.finished ? 'text-brand-red' : 'text-navy-900'}`}
                          title={`${formatCurr(done.achieved)} / ${formatCurr(target.total_amount)}${done.finished ? ` · ${t('purchaseTarget_ended')}` : ''}`}
                        >
                          {formatNum(Math.round(done.percent))}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(target); setShowModal(true) }} title={t('common_edit')} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"><Pencil size={13} /></button>
                        <button onClick={() => remove(target.id)} title={t('common_delete')} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-brand-red"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableScroller>
      </div>

      {showModal && (
        <TargetModal
          item={editing}
          suppliers={suppliers}
          ownerId={profile?.owner_id || profile?.id || null}
          onClose={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function TargetModal({ item, suppliers, ownerId, onClose }: {
  item: any; suppliers: any[]; ownerId: string | null; onClose: () => void
}) {
  const { t, formatCurr, monthName } = useLang()
  const now = new Date()
  const currentYear = now.getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 1 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  const [form, setForm] = useState({
    supplier_id: item?.supplier_id ?? '',
    start_month: item?.start_month ?? now.getMonth() + 1,
    start_year: item?.start_year ?? currentYear,
    end_month: item?.end_month ?? now.getMonth() + 1,
    end_year: item?.end_year ?? currentYear,
    total_amount: item?.total_amount ?? 0,
  })
  const [saving, setSaving] = useState(false)

  const monthCount = monthsInRange(form)
  const perMonth = perMonthAmount(Number(form.total_amount || 0), monthCount)

  async function save() {
    if (!form.supplier_id) return toast.error(t('purchaseTarget_pickCompany'))
    if (monthCount === 0) return toast.error(t('purchaseTarget_badRange'))

    setSaving(true)
    try {
      const payload = {
        supplier_id: form.supplier_id,
        start_year: Number(form.start_year),
        start_month: Number(form.start_month),
        end_year: Number(form.end_year),
        end_month: Number(form.end_month),
        total_amount: Number(form.total_amount || 0),
        owner_id: ownerId,
      }

      const { error } = item
        ? await supabase.from('purchase_targets').update(payload).eq('id', item.id)
        : await supabase.from('purchase_targets').insert(payload)

      if (error) throw error
      toast.success(item ? t('common_updated') : t('common_saved'))
      onClose()
    } catch (error: any) {
      toast.error(error.message || t('common_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={item ? t('purchaseTarget_edit') : t('purchaseTarget_add')} size="md">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="pt-company">{t('purchaseTarget_company')}</label>
          <select id="pt-company" className="input" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
            <option value="">{t('purchaseTarget_pickCompany')}</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id}>{supplier.company_name || supplier.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pt-start-month">{t('purchaseTarget_start')}</label>
            <div className="flex gap-2">
              <select id="pt-start-month" className="input" value={form.start_month} onChange={e => setForm({ ...form, start_month: Number(e.target.value) })}>
                {months.map(month => <option key={month} value={month}>{monthName(month)}</option>)}
              </select>
              <select className="input" value={form.start_year} onChange={e => setForm({ ...form, start_year: Number(e.target.value) })}>
                {years.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="pt-end-month">{t('purchaseTarget_end')}</label>
            <div className="flex gap-2">
              <select id="pt-end-month" className="input" value={form.end_month} onChange={e => setForm({ ...form, end_month: Number(e.target.value) })}>
                {months.map(month => <option key={month} value={month}>{monthName(month)}</option>)}
              </select>
              <select className="input" value={form.end_year} onChange={e => setForm({ ...form, end_year: Number(e.target.value) })}>
                {years.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="pt-total">{t('purchaseTarget_total')}</label>
          <input
            id="pt-total"
            type="number"
            min="0"
            className="input"
            value={form.total_amount || ''}
            onChange={e => setForm({ ...form, total_amount: Number(e.target.value) })}
          />
        </div>

        {/* The two derived figures, shown while typing so the range and the
            amount can be judged together rather than after saving. */}
        <div className="rounded-xl border border-surface-border bg-surface px-4 py-3 text-sm">
          {monthCount === 0 ? (
            <p className="text-brand-red">{t('purchaseTarget_badRange')}</p>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">{t('purchaseTarget_months')}: <strong className="text-navy-900">{monthCount}</strong></span>
              <span className="text-neutral-600">{t('purchaseTarget_perMonth')}: <strong className="text-brand-green">{formatCurr(perMonth)}</strong></span>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            <Save size={15} /> {saving ? t('common_saving') : t('common_save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
