import React, { useEffect, useState } from 'react'
import { PencilSimpleIcon as Pencil, PlusIcon as Plus, FloppyDiskIcon as Save, TrashIcon as Trash2 } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import { useLang } from '../../context/LanguageContext'
import { isValidBdPhone, INVALID_PHONE_MESSAGE } from '../../lib/phone'

// Moved out of Settings: the supplier list belongs with the purchase pages
// that use it.
const REQUIRED_FIELD_MESSAGE = 'This field is required!'
type ShareholderValidationErrors = Partial<Record<'name' | 'phone', string>>

export default function SupplierList() {
  const { t, formatCurr } = useLang()
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data } = await supabase.from('suppliers').select('*')
    setSuppliers(data || [])
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

  return (
    <div className="min-h-screen bg-white p-6">
      <PageHeader title={t('settings_supplierList', 'Suppliers list')} subtitle={t('settings_tabSuppliers')} />

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">{t('settings_supplierList')}</h2>
          <button onClick={() => openModal('supplier')} className="btn-primary"><Plus size={16} /> {t('common_add')}</button>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-3">{t('settings_companyName')}</th>
              <th className="text-left py-2 px-3">{t('settings_personName')}</th>
              <th className="text-left py-2 px-3">{t('common_phone')}</th>
              <th className="text-right py-2 px-3">{t('settings_openingDue')}</th>
              <th className="text-left py-2 px-3">{t('settings_dueType')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map(sup => (
              <tr key={sup.id} className="table-row">
                <td className="py-2 px-3 font-medium">{sup.company_name || sup.name}</td>
                <td className="py-2 px-3 text-slate-500">{sup.person_name}</td>
                <td className="py-2 px-3 text-slate-500">{sup.phone}</td>
                <td className="py-2 px-3 text-right font-medium text-brand-red">{formatCurr(Number(sup.opening_due || 0))}</td>
                <td className="py-2 px-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${sup.due_type === 'pawna' ? 'badge-green' : 'badge-red'}`}>
                    {sup.due_type === 'pawna' ? t('settings_pawnaReceivable').split(' ')[0] : t('settings_denaPayable').split(' ')[0]}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openModal('supplier', sup)} className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => deleteRow('suppliers', sup.id, 'This supplier has linked purchases or payments and cannot be deleted.')} className="p-1 text-slate-400 hover:text-brand-red hover:bg-red-50 rounded transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t('common_noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <SupplierModal item={editItem} onClose={() => { setShowModal(false); loadAll() }} />
      )}
    </div>
  )
}

function SupplierModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { t } = useLang()
  const [form, setForm] = useState({
    company_name: item?.company_name || item?.name || '',
    person_name: item?.person_name || '',
    phone: item?.phone || '',
    email: item?.email || '',
    address: item?.address || '',
    opening_due: item?.opening_due || 0,
    due_type: item?.due_type || 'dena',
  })
  const [loading, setLoading] = useState(false)

  async function save() {
    if (!form.company_name.trim()) { toast.error(t('settings_companyNameRequired')); return }
    if (!form.phone.trim()) { toast.error(t('settings_phoneRequired')); return }
    if ((!item || form.phone.trim() !== String(item.phone || '').trim()) && !isValidBdPhone(form.phone)) { toast.error(INVALID_PHONE_MESSAGE); return }
    setLoading(true)
    try {
      const payload = { ...form, name: form.company_name }
      if (item?.id) { await supabase.from('suppliers').update(payload).eq('id', item.id) }
      else { await supabase.from('suppliers').insert(payload) }
      toast.success(t('common_saved'))
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={item ? t('settings_editSupplier') : t('settings_newSupplier')} size="sm">
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="settings-f23">{t('settings_companyName')} *</label>
          <input id="settings-f23" className="input" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="settings-f24">{t('settings_personName')}</label>
          <input id="settings-f24" className="input" value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="settings-f25">{t('settings_phoneStar')}</label>
          <input id="settings-f25" className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="settings-f26">{t('common_email')}</label>
          <input id="settings-f26" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="settings-f27">{t('common_address')}</label>
          <input id="settings-f27" className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="settings-f28">{t('settings_openingDueTaka')}</label>
            <input id="settings-f28" type="number" min="0" className="input" value={form.opening_due} onChange={e => setForm({ ...form, opening_due: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="settings-f29">{t('settings_dueType')}</label>
            <select id="settings-f29" className="input" value={form.due_type} onChange={e => setForm({ ...form, due_type: e.target.value })}>
              <option value="dena">{t('settings_denaPayable')}</option>
              <option value="pawna">{t('settings_pawnaReceivable')}</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
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
