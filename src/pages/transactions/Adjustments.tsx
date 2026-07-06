import React, { useState, useEffect } from 'react'
import { Plus, Save, ArrowRight, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'

export default function Adjustments() {
  const { t, formatCurr } = useLang()
  const [records, setRecords] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const { user } = useAuth()
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], from_account_id: '', from_account_name: '', to_account_id: '', to_account_name: '', amount: 0, notes: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [recRes, accRes] = await Promise.all([
      supabase.from('account_transfers').select('*').order('date', { ascending: false }),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
    ])
    setRecords(recRes.data || []); setAccounts(accRes.data || [])
  }

  async function save() {
    if (!form.from_account_id || !form.to_account_id || !form.amount) { toast.error(t('adjustments_fillAllFields')); return }
    if (form.from_account_id === form.to_account_id) { toast.error(t('adjustments_differentAccounts')); return }
    const from = accounts.find(a => a.id === form.from_account_id)
    const to = accounts.find(a => a.id === form.to_account_id)
    const payload = { ...form, from_account_name: from?.name || form.from_account_name || '', to_account_name: to?.name || form.to_account_name || '' }
    const { error } = editingRecord
      ? await supabase.from('account_transfers').update(payload).eq('id', editingRecord.id)
      : await supabase.from('account_transfers').insert({ ...payload, created_by: user?.id })

    if (error) return toast.error(error.message || t('common_error'))
    toast.success(editingRecord ? t('common_updated') : t('adjustments_saved'))
    closeModal()
    loadAll()
  }

  function openNewModal() {
    setEditingRecord(null)
    setForm({ date: new Date().toISOString().split('T')[0], from_account_id: '', from_account_name: '', to_account_id: '', to_account_name: '', amount: 0, notes: '' })
    setShowModal(true)
  }

  function openEditModal(record: any) {
    setEditingRecord(record)
    setForm({
      date: record.date || new Date().toISOString().split('T')[0],
      from_account_id: record.from_account_id || '',
      from_account_name: record.from_account_name || '',
      to_account_id: record.to_account_id || '',
      to_account_name: record.to_account_name || '',
      amount: Number(record.amount || 0),
      notes: record.notes || '',
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingRecord(null)
  }

  async function deleteRecord(record: any) {
    if (!(await confirmAction({
      title: 'Delete Balance Transfer?',
      message: 'Are you sure you want to delete this balance transfer transaction? Doing so will reverse the balance adjustments between the respective accounts.',
      confirmText: 'Yes, Delete',
      cancelText: 'No, Cancel',
    }))) return

    const { error } = await supabase.from('account_transfers').delete().eq('id', record.id)
    if (error) return toast.error(error.message || t('common_error'))
    toast.success('Transfer transaction deleted successfully.')
    loadAll()
  }

  const totalTransferred = records.reduce((s, r) => s + Number(r.amount || 0), 0)

  return (
    <div className="p-6">
      <PageHeader title={t('adjustments_title')} subtitle={t('adjustments_subtitle')} actions={<button onClick={openNewModal} className="btn-primary"><Plus size={16} /> {t('adjustments_new')}</button>} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card"><p className="text-xs text-slate-500">{t('adjustments_totalTransfer')}</p><p className="text-2xl font-bold text-slate-800 mt-1">{formatCurr(totalTransferred)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('adjustments_totalTx')}</p><p className="text-2xl font-bold text-slate-800 mt-1">{records.length}</p></div>
        <div className="card bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-600 font-medium">{t('adjustments_note')}</p>
          <p className="text-xs text-blue-500 mt-1">{t('adjustments_noteText')}</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">{t('adjustments_list')}</div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4 w-12">#</th>
              <th className="text-left py-2 px-4">{t('common_date')}</th>
              <th className="text-left py-2 px-4">{t('adjustments_colFrom')}</th>
              <th className="py-2 px-2"></th>
              <th className="text-left py-2 px-4">{t('adjustments_colTo')}</th>
              <th className="text-right py-2 px-4">{t('common_amount')}</th>
              <th className="text-left py-2 px-4">{t('common_note')}</th>
              <th className="text-center py-2 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, index) => (
              <tr key={r.id} className="table-row">
                <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                <td className="py-2.5 px-4">{formatDate(r.date)}</td>
                <td className="py-2.5 px-4"><span className="badge-red">{r.from_account_name}</span></td>
                <td className="py-2 px-2 text-slate-400"><ArrowRight size={14} /></td>
                <td className="py-2.5 px-4"><span className="badge-green">{r.to_account_name}</span></td>
                <td className="py-2.5 px-4 text-right font-semibold">{formatCurr(r.amount)}</td>
                <td className="py-2.5 px-4 text-slate-400">{r.notes}</td>
                <td className="py-2.5 px-4">
                  <div className="flex justify-center gap-2">
                    <button onClick={() => openEditModal(r)} className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteRecord(r)} className="rounded-lg bg-red-50 p-1.5 text-red-500 hover:bg-red-100" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('adjustments_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={closeModal} title={editingRecord ? 'Edit Transfer' : t('adjustments_newTitle')}>
        <div className="space-y-3">
          <div><label className="label">{t('common_date')}</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div>
            <label className="label">{t('adjustments_fromAccount')}</label>
            <select className="input" value={form.from_account_id} onChange={e => setForm({ ...form, from_account_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('adjustments_toAccount')}</label>
            <select className="input" value={form.to_account_id} onChange={e => setForm({ ...form, to_account_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {accounts.filter(a => a.id !== form.from_account_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('adjustments_amountLabel')}</label><input type="number" min="0" className="input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div><label className="label">{t('common_note')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {editingRecord ? t('common_update', 'Update') : t('common_save')}</button>
            <button onClick={closeModal} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
