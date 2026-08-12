import React, { useEffect, useState } from 'react'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'

// Moved out of Settings: a monthly target is what the reports measure against,
// so it is set where those reports are read.
const REQUIRED_FIELD_MESSAGE = 'This field is required!'
type ShareholderValidationErrors = Partial<Record<'name' | 'phone', string>>

export default function MonthlyTarget() {
  const { t, formatCurr, monthName } = useLang()
  const { profile: currentProfile } = useAuth()
  const [targets, setTargets] = useState<any[]>([])
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [editTarget, setEditTarget] = useState<any>(null)
  const currentYear = new Date().getFullYear()

  useEffect(() => { loadTargets().then(setTargets) }, [])

  async function loadTargets() {
    const { data, error } = await supabase
      .from('monthly_targets')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
    if (error) {
      toast.error('Error loading targets: ' + (error.message || 'Unknown error'))
      return []
    }
    return data || []
  }

  async function reload() {
    setTargets(await loadTargets())
  }

  async function deleteTarget(id: string) {
    const confirmed = await confirmAction({ message: t('common_confirmDelete') })
    if (!confirmed) return
    const { error } = await supabase.from('monthly_targets').delete().eq('id', id)
    if (error) {
      toast.error(error.message || t('common_error'))
      return
    }
    toast.success(t('common_deleted'))
    reload()
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <PageHeader title={t('settings_tabTargets')} subtitle={t('settings_monthlyTargets', 'Sales and profit targets by month')} />

      <div className="card p-0">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{t('settings_targetsList')} ({targets.length})</h2>
          <button onClick={() => { setEditTarget(null); setShowTargetModal(true) }} className="btn-primary">
            <Plus size={16} /> {t('settings_addTarget')}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4">{t('settings_monthStar')}</th>
              <th className="text-left py-2 px-4">{t('settings_yearStar')}</th>
              <th className="text-right py-2 px-4">{t('settings_salesTarget')}</th>
              <th className="text-right py-2 px-4">{t('settings_profitTarget')}</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {targets.map(tgt => (
              <tr key={tgt.id} className="table-row">
                <td className="py-2.5 px-4 font-medium">{monthName(tgt.month)}</td>
                <td className="py-2.5 px-4 text-slate-500">{tgt.year}</td>
                <td className="py-2.5 px-4 text-right font-medium text-slate-800">{formatCurr(tgt.sales_target)}</td>
                <td className="py-2.5 px-4 text-right font-medium text-brand-green">{formatCurr(tgt.profit_target)}</td>
                <td className="py-2.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { setEditTarget(tgt); setShowTargetModal(true) }} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => deleteTarget(tgt.id)} className="p-1.5 text-slate-400 hover:text-brand-red hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {targets.length === 0 && (
              <tr><td colSpan={5} className="text-center py-10 text-slate-400">{t('common_noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showTargetModal && (
          <TargetModal
            item={editTarget}
            existingTargets={targets}
            ownerId={currentProfile?.owner_id || currentProfile?.id || null}
            onClose={() => { setShowTargetModal(false); reload() }}
          />
      )}
    </div>
  )
}

function TargetModal({ item, existingTargets, ownerId, onClose }: { item: any; existingTargets: any[]; ownerId: string | null; onClose: () => void }) {
  const { t, formatCurr, monthName } = useLang()
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i)
  const [form, setForm] = useState({
    month: item?.month ?? (new Date().getMonth() + 1),
    year: item?.year ?? currentYear,
    sales_target: item?.sales_target ?? 0,
    profit_target: item?.profit_target ?? 0,
  })
  const [loading, setLoading] = useState(false)

  function isDuplicateTargetError(error: any) {
    const message = String(error?.message || '')
    return error?.code === '23505' || message.includes('monthly_targets_year_month_key')
  }

  async function save() {
    setLoading(true)
    try {
      const payload = {
        month: Number(form.month),
        year: Number(form.year),
        sales_target: Number(form.sales_target || 0),
        profit_target: Number(form.profit_target || 0),
        owner_id: ownerId,
        updated_at: new Date().toISOString(),
      }

      if (item?.id) {
        const duplicate = existingTargets.find(t => (
          Number(t.month) === payload.month &&
          Number(t.year) === payload.year &&
          t.id !== item.id
        ))
        if (duplicate) {
          toast.error('This month target already exists!')
          return
        }

        const { error } = await supabase.from('monthly_targets').update(payload).eq('id', item.id)
        if (error) {
          toast.error(isDuplicateTargetError(error) ? 'This month target already exists!' : error.message)
          return
        }
        toast.success(t('common_updated'))
      } else {
        const exists = existingTargets.find(t => Number(t.month) === payload.month && Number(t.year) === payload.year)
        if (exists?.id) {
          const { error } = await supabase.from('monthly_targets').update(payload).eq('id', exists.id)
          if (error) {
            toast.error(error.message)
            return
          }
          toast.success(t('common_updated'))
          onClose()
          return
        }

        const { error } = await supabase
          .from('monthly_targets')
          .upsert(payload, { onConflict: 'year,month' })
        if (error) {
          if (isDuplicateTargetError(error)) {
            toast.error('This month target already exists!')
          } else {
            toast.error(error.message)
          }
          return
        }
        toast.success(t('common_added'))
      }
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={item ? t('settings_editTarget') : t('settings_addTarget')} size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="settings-f8">{t('settings_monthStar')}</label>
            <select id="settings-f8" className="input" value={form.month} onChange={e => setForm({ ...form, month: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="settings-f9">{t('settings_yearStar')}</label>
            <select id="settings-f9" className="input" value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="settings-f10">{t('settings_salesTarget')}</label>
          <input id="settings-f10" type="number" min="0" className="input" value={form.sales_target} onChange={e => setForm({ ...form, sales_target: Number(e.target.value) })} placeholder="0" />
        </div>
        <div>
          <label className="label" htmlFor="settings-f11">{t('settings_profitTarget')}</label>
          <input id="settings-f11" type="number" min="0" className="input" value={form.profit_target} onChange={e => setForm({ ...form, profit_target: Number(e.target.value) })} placeholder="0" />
        </div>
        <div className="pt-1 p-3 rounded-xl bg-slate-50 text-sm text-slate-600">
          <span className="font-medium">{monthName(form.month)} {form.year}</span> — {t('settings_salesTarget').split(' ')[0]}: <span className="text-slate-800 font-medium">{formatCurr(form.sales_target)}</span>, {t('settings_profitTarget').split(' ')[0]}: <span className="text-brand-green font-medium">{formatCurr(form.profit_target)}</span>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={save} disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={15} />}
            {loading ? t('common_saving') : t('common_save')}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}

