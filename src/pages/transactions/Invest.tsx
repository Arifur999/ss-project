import React, { useState, useEffect } from 'react'
import { Plus, Save, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'

export default function InvestWithdraw() {
  const { t, formatCurr } = useLang()
  const [records, setRecords] = useState<any[]>([])
  const [shareholders, setShareholders] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const { user } = useAuth()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], shareholder_id: '', shareholder_name: '', invest_amount: 0, withdraw_amount: 0, account_id: '', account_name: '', notes: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [recRes, shRes, accRes] = await Promise.all([
      supabase.from('investments').select('*').order('date', { ascending: false }),
      supabase.from('shareholders').select('*').order('sort_order'),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
    ])
    setRecords(recRes.data || []); setShareholders(shRes.data || []); setAccounts(accRes.data || [])
  }

  async function save() {
    if (!form.shareholder_id || !form.account_id) { toast.error(t('invest_fillAllFields')); return }
    const sh = shareholders.find(s => s.id === form.shareholder_id)
    const acc = accounts.find(a => a.id === form.account_id)

    if (editingId) {
      await supabase.from('investments').update({ ...form, shareholder_name: sh?.name || '', account_name: acc?.name || '' }).eq('id', editingId)
    } else {
      await supabase.from('investments').insert({ ...form, shareholder_name: sh?.name || '', account_name: acc?.name || '', created_by: user?.id })
    }

    toast.success(t('invest_saved')); resetForm(); loadAll()
  }

  function editRecord(record: any) {
    setEditingId(record.id)
    setForm({ date: record.date, shareholder_id: record.shareholder_id, shareholder_name: record.shareholder_name, invest_amount: record.invest_amount, withdraw_amount: record.withdraw_amount, account_id: record.account_id, account_name: record.account_name, notes: record.notes })
    setShowModal(true)
  }

  async function deleteRecord(id: string) {
    if (!(await confirmAction({ message: 'Are you sure you want to delete this record?' }))) return
    const record = records.find(r => r.id === id)
    if (record) {
      addRecycleItem({
        type: 'transactions',
        table: 'investments',
        title: record.shareholder_name || '-',
        subtitle: record.account_name || record.notes || '-',
        amount: Number(record.invest_amount || record.withdraw_amount || 0),
        data: record,
      })
    }
    const { error } = await supabase.from('investments').delete().eq('id', id)
    if (error) { toast.error(error.message || t('common_error')); return }
    toast.success(t('common_deleted')); loadAll()
  }

  function resetForm() {
    setEditingId(null)
    setForm({ date: new Date().toISOString().split('T')[0], shareholder_id: '', shareholder_name: '', invest_amount: 0, withdraw_amount: 0, account_id: '', account_name: '', notes: '' })
    setShowModal(false)
  }

  const totalInvest = records.reduce((s, r) => s + Number(r.invest_amount || 0), 0)
  const totalWithdraw = records.reduce((s, r) => s + Number(r.withdraw_amount || 0), 0)

  return (
    <div className="p-6">
      <PageHeader title={t('invest_subtitle')} subtitle={t('invest_title')} actions={<button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} /> {t('invest_new')}</button>} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card"><p className="text-xs text-slate-500">{t('invest_totalInvestment')}</p><p className="text-2xl font-bold text-brand-green mt-1">{formatCurr(totalInvest)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('invest_totalWithdrawal')}</p><p className="text-2xl font-bold text-brand-red mt-1">{formatCurr(totalWithdraw)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('invest_netInvestment')}</p><p className={`text-2xl font-bold mt-1 ${totalInvest - totalWithdraw >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>{formatCurr(totalInvest - totalWithdraw)}</p></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">{t('invest_txList')}</div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4 w-12">#</th>
              <th className="text-left py-2 px-4">{t('common_date')}</th>
              <th className="text-left py-2 px-4">{t('invest_colShareholder')}</th>
              <th className="text-right py-2 px-4">{t('invest_colInvestment')}</th>
              <th className="text-right py-2 px-4">{t('invest_colWithdrawal')}</th>
              <th className="text-left py-2 px-4">{t('invest_colAccount')}</th>
              <th className="text-left py-2 px-4">{t('invest_colNotes')}</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, index) => (
              <tr key={r.id} className="table-row">
                <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                <td className="py-2.5 px-4">{formatDate(r.date)}</td>
                <td className="py-2.5 px-4 font-medium">{r.shareholder_name}</td>
                <td className="py-2.5 px-4 text-right text-brand-green font-medium">{r.invest_amount > 0 ? formatCurr(r.invest_amount) : '—'}</td>
                <td className="py-2.5 px-4 text-right text-brand-red font-medium">{r.withdraw_amount > 0 ? formatCurr(r.withdraw_amount) : '—'}</td>
                <td className="py-2.5 px-4 text-slate-500">{r.account_name}</td>
                <td className="py-2.5 px-4 text-slate-400">{r.notes}</td>
                <td className="py-2.5 px-4 text-right">
                  {r.created_by === user?.id && (
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => editRecord(r)} className="text-blue-500 hover:text-blue-600"><Edit2 size={14} /></button>
                      <button onClick={() => deleteRecord(r.id)} className="text-red-500 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('invest_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? t('invest_editTitle') : t('invest_newTitle')}>
        <div className="space-y-3">
          <div><label className="label">{t('common_date')}</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div>
            <label className="label">{t('invest_colShareholder')}</label>
            <select className="input" value={form.shareholder_id} onChange={e => setForm({ ...form, shareholder_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {shareholders.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('invest_investAmount')}</label><input type="number" min="0" className="input" value={form.invest_amount || ''} onChange={e => setForm({ ...form, invest_amount: Number(e.target.value) })} /></div>
          <div><label className="label">{t('invest_withdrawAmount')}</label><input type="number" min="0" className="input" value={form.withdraw_amount || ''} onChange={e => setForm({ ...form, withdraw_amount: Number(e.target.value) })} /></div>
          <div>
            <label className="label">{t('invest_colAccount')}</label>
            <select className="input" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('invest_colNotes')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {t('common_save')}</button>
            <button onClick={resetForm} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
