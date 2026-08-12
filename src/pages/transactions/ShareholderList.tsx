import React, { useEffect, useState } from 'react'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import { useLang } from '../../context/LanguageContext'
import { isValidBdPhone, INVALID_PHONE_MESSAGE } from '../../lib/phone'

// Moved out of Settings: a shareholder list belongs beside the investments and
// withdrawals it explains, not behind a settings tab.
const SHAREHOLDER_OPENING_AMOUNT_FALLBACK_KEY = 'shareholder_opening_amount_fallback_v1'
const REQUIRED_FIELD_MESSAGE = 'This field is required!'
type ShareholderValidationErrors = Partial<Record<'name' | 'phone', string>>

function readShareholderOpeningAmountFallback(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SHAREHOLDER_OPENING_AMOUNT_FALLBACK_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveShareholderOpeningAmountFallback(shareholderId: string, amount: number) {
  if (!shareholderId) return
  const current = readShareholderOpeningAmountFallback()
  localStorage.setItem(SHAREHOLDER_OPENING_AMOUNT_FALLBACK_KEY, JSON.stringify({
    ...current,
    [shareholderId]: Number(amount || 0),
  }))
}

function isMissingOpeningAmountColumn(error: any) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('opening_amount') && (
    message.includes('schema cache') ||
    message.includes('column') ||
    error?.code === 'PGRST204'
  )
}

export default function ShareholderList() {
  const { t, formatCurr } = useLang()
  const [shareholders, setShareholders] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data } = await supabase.from('shareholders').select('*').order('sort_order')
    const openingAmountFallback = readShareholderOpeningAmountFallback()
    setShareholders((data || []).map((shareholder: any) => ({
      ...shareholder,
      opening_amount: Number(shareholder.opening_amount ?? openingAmountFallback[shareholder.id] ?? 0),
    })))
  }

  function openModal(_type: string, item?: any) {
    setEditItem(item || null)
    setShowModal(true)
  }

  async function deleteRow(table: string, id: string, linkedHint: string) {
    const confirmed = await confirmAction({ message: t('common_confirmDelete') })
    if (!confirmed) return

    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      const message = String(error.message || '')
      const isLinked = error.code === 409 || /linked|foreign|constraint/i.test(message)
      toast.error(isLinked ? linkedHint : (message || t('common_error')))
      return
    }
    toast.success(t('common_deleted'))
    loadAll()
  }

  // Shares are shown as a whole only once any capital exists, exactly as the
  // settings tab did.
  const totalShareCapital = shareholders.reduce((sum, sh) => sum + Number(sh.opening_amount || 0), 0)
  const totalSharePercent = totalShareCapital > 0 ? 100 : 0

  return (
    <div className="min-h-screen bg-white p-6">
      <PageHeader title={t('settings_shareholderList')} subtitle={t('settings_tabShareholders')} />

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-800">{t('settings_shareholderList')}</h2>
            <p className="text-xs text-slate-500">{t('settings_totalShare')} {totalSharePercent.toFixed(1)}%</p>
          </div>
          <button onClick={() => openModal('shareholder')} className="btn-primary">
            <Plus size={16} /> {t('common_add')}
          </button>
        </div>
        <div className="w-full overflow-x-auto rounded-lg shadow-sm">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="text-left py-2 px-3 w-12">#</th>
                <th className="text-left py-2 px-3">{t('common_name')}</th>
                <th className="text-left py-2 px-3">{t('common_phone')}</th>
                <th className="text-left py-2 px-3">{t('common_address')}</th>
                <th className="text-right py-2 px-3">{t('invest_openingAmount')}</th>
                <th className="text-right py-2 px-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {shareholders.map((sh, index) => {
                const openingAmount = Number(sh.opening_amount || 0)
                return (
                  <tr key={sh.id} className="table-row">
                    <td className="py-2 px-3 text-slate-500">{index + 1}</td>
                    <td className="py-2 px-3 font-medium">{sh.name}</td>
                    <td className="py-2 px-3 text-slate-500">{sh.phone || '-'}</td>
                    <td className="py-2 px-3 text-slate-500">{sh.address || '-'}</td>
                    <td className="py-2 px-3 text-right text-slate-500">{formatCurr(openingAmount)}</td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openModal('shareholder', sh)} className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"><Pencil size={13} /></button>
                        <button onClick={() => deleteRow('shareholders', sh.id, 'This shareholder has investment or withdrawal records and cannot be deleted. Remove those entries first.')} className="p-1 text-slate-400 hover:text-brand-red hover:bg-red-50 rounded transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ShareholderModal item={editItem} onClose={() => { setShowModal(false); loadAll() }} />
      )}
    </div>
  )
}

function ShareholderModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { t } = useLang()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<ShareholderValidationErrors>({})
  const [form, setForm] = useState({
    name: item?.name || '',
    phone: item?.phone || '',
    address: item?.address || '',
    opening_amount: Number(item?.opening_amount || 0),
    share_percentage: Number(item?.share_percentage || 0),
  })

  function clearError(field: keyof ShareholderValidationErrors) {
    setErrors(current => {
      if (!current[field]) return current
      const { [field]: _removed, ...rest } = current
      return rest
    })
  }

  function requiredLabel(label: string) {
    return (
      <>
        {label}<span className="text-red-500"> *</span>
      </>
    )
  }

  function inputClass(hasError: boolean) {
    return `input ${hasError ? 'border-red-300 focus:ring-red-400' : ''}`
  }

  async function save() {
    const nextErrors: ShareholderValidationErrors = {}
    const name = form.name.trim()
    const phone = form.phone.trim()

    if (!name) nextErrors.name = REQUIRED_FIELD_MESSAGE
    if (!phone) nextErrors.phone = REQUIRED_FIELD_MESSAGE
    // Only enforce the format for new records or when the phone was changed, so
    // editing an old record with a legacy number isn't blocked.
    else if ((!item || phone !== String(item.phone || '').trim()) && !isValidBdPhone(phone)) nextErrors.phone = INVALID_PHONE_MESSAGE

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setLoading(true)
    try {
      const payload = {
        ...form,
        name,
        phone,
        address: form.address.trim(),
        opening_amount: Number(form.opening_amount || 0),
        share_percentage: Number(form.share_percentage || 0),
      }
      const basePayload = {
        name: payload.name,
        phone: payload.phone,
        address: payload.address,
        share_percentage: payload.share_percentage,
      }
      const result = item?.id
        ? await supabase.from('shareholders').update(payload).eq('id', item.id)
        : await supabase.from('shareholders').insert(payload).select('id').maybeSingle()

      if (result.error) {
        if (!isMissingOpeningAmountColumn(result.error)) {
          toast.error(result.error.message || t('common_error'))
          return
        }

        const retry = item?.id
          ? await supabase.from('shareholders').update(basePayload).eq('id', item.id)
          : await supabase.from('shareholders').insert(basePayload).select('id').maybeSingle()

        if (retry.error) {
          toast.error(retry.error.message || t('common_error'))
          return
        }

        const shareholderId = item?.id || retry.data?.id
        saveShareholderOpeningAmountFallback(shareholderId, payload.opening_amount)
      } else {
        const shareholderId = item?.id || result.data?.id
        saveShareholderOpeningAmountFallback(shareholderId, payload.opening_amount)
      }

      toast.success(t('common_saved'))
      onClose()
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal isOpen onClose={onClose} title={item ? t('settings_editShareholder') : t('settings_newShareholder')}>
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="settings-f17">{requiredLabel(t('common_name'))}</label>
          <input id="settings-f17"
            className={inputClass(Boolean(errors.name))}
            value={form.name}
            onChange={e => {
              clearError('name')
              setForm({ ...form, name: e.target.value })
            }}
            required
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label className="label" htmlFor="settings-f18">{requiredLabel(t('common_phone'))}</label>
          <input id="settings-f18"
            className={inputClass(Boolean(errors.phone))}
            value={form.phone}
            onChange={e => {
              clearError('phone')
              setForm({ ...form, phone: e.target.value })
            }}
            required
          />
          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
        </div>
        <div><label className="label" htmlFor="settings-f19">{t('common_address')}</label><input id="settings-f19" className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
        <div>
          <label className="label" htmlFor="settings-f20">{t('invest_openingAmount')} (৳)</label>
          <input id="settings-f20"
            type="number"
            min="0"
            className="input"
            value={form.opening_amount || ''}
            onChange={e => setForm({ ...form, opening_amount: Number(e.target.value) })}
            placeholder="0"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={16} />}
            {t('common_save')}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}
