import React, { useEffect, useState } from 'react'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import { useLang } from '../../context/LanguageContext'

// Moved out of Settings: the accounts money sits in belong with Balance.
const REQUIRED_FIELD_MESSAGE = 'This field is required!'
type ShareholderValidationErrors = Partial<Record<'name' | 'phone', string>>

export default function Wallet() {
  const { t, formatCurr } = useLang()
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data } = await supabase.from('accounts').select('*').order('sort_order')
    setAccounts(data || [])
  }

  function openModal(_type: string, item?: any) {
    setEditItem(item || null)
    setShowModal(true)
  }

  async function toggleAccount(id: string, is_active: boolean) {
    await supabase.from('accounts').update({ is_active }).eq('id', id)
    loadAll()
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

  return (
    <div className="min-h-screen bg-white p-6">
      <PageHeader title={t('nav_wallet', 'Wallet')} subtitle={t('settings_tabAccounts')} />

      <div className="card p-0">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{t('settings_tabAccounts')}</h2>
          <button onClick={() => openModal('account')} className="btn-primary"><Plus size={16} /> {t('common_add')}</button>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4">{t('common_name')}</th>
              <th className="text-right py-2 px-4">{t('settings_openingBalance')}</th>
              <th className="text-center py-2 px-4">{t('common_active')}</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(acc => (
              <tr key={acc.id} className="table-row">
                <td className="py-2.5 px-4 font-medium">{acc.name}</td>
                <td className="py-2.5 px-4 text-right">{formatCurr(acc.opening_balance)}</td>
                <td className="py-2.5 px-4 text-center">
                  <button
                    onClick={() => toggleAccount(acc.id, !acc.is_active)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${acc.is_active ? 'bg-slate-900' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${acc.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openModal('account', acc)} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => deleteRow('accounts', acc.id, 'This account has linked transactions and cannot be deleted.')} className="p-1.5 text-slate-400 hover:text-brand-red hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={4} className="text-center py-10 text-slate-400">{t('common_noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <AccountModal item={editItem} onClose={() => { setShowModal(false); loadAll() }} />
      )}
    </div>
  )
}

function AccountModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { t } = useLang()
  const [form, setForm] = useState({ name: item?.name || '', type: item?.type || 'cash', opening_balance: item?.opening_balance || 0 })
  const [loading, setLoading] = useState(false)

  async function save() {
    if (!form.name.trim()) { toast.error(t('common_fillAllFields')); return }
    setLoading(true)
    try {
      if (item?.id) { await supabase.from('accounts').update(form).eq('id', item.id) }
      else { await supabase.from('accounts').insert({ ...form, is_active: true }) }
      toast.success(t('common_saved'))
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={item ? `${t('common_edit')} — ${item.name}` : `${t('common_add')} ${t('settings_tabAccounts')}`}>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="settings-f21">{t('common_name')} *</label>
          <input id="settings-f21" className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="settings-f22">{t('settings_openingBalance')} (৳)</label>
          <input id="settings-f22" type="number" min="0" className="input" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: Number(e.target.value) })} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={15} />}
            {t('common_save')}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}
