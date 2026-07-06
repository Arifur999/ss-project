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

export default function ProfitWithdraw() {
  const { t, formatCurr, monthName } = useLang()
  const [records, setRecords] = useState<any[]>([])
  const [shareholders, setShareholders] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const { user } = useAuth()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    shareholder_id: '', shareholder_name: '',
    amount: 0, account_id: '', account_name: '',
    profit_month: new Date().getMonth() + 1,
    profit_year: new Date().getFullYear(), notes: ''
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [recRes, shRes, accRes] = await Promise.all([
      supabase.from('profit_withdrawals').select('*').order('date', { ascending: false }),
      supabase.from('shareholders').select('*').order('sort_order'),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
    ])
    setRecords(recRes.data || [])
    setShareholders(shRes.data || [])
    setAccounts(accRes.data || [])
  }

  async function save() {
    if (!form.shareholder_id || !form.account_id || !form.amount) return toast.error(t('profitWithdraw_fillAllFields'))
    const sh = shareholders.find(s => s.id === form.shareholder_id)
    const acc = accounts.find(a => a.id === form.account_id)

    if (editingId) {
      await supabase.from('profit_withdrawals').update({
        ...form, shareholder_name: sh?.name || '', account_name: acc?.name || ''
      }).eq('id', editingId)
    } else {
      await supabase.from('profit_withdrawals').insert({
        ...form, shareholder_name: sh?.name || '', account_name: acc?.name || '', created_by: user?.id,
      })
    }

    toast.success(t('profitWithdraw_saved'))
    resetForm()
    loadAll()
  }

  function editRecord(record: any) {
    setEditingId(record.id)
    setForm({
      date: record.date,
      shareholder_id: record.shareholder_id,
      shareholder_name: record.shareholder_name,
      amount: record.amount,
      account_id: record.account_id,
      account_name: record.account_name,
      profit_month: record.profit_month,
      profit_year: record.profit_year,
      notes: record.notes
    })
    setShowModal(true)
  }

  async function deleteRecord(id: string) {
    if (!(await confirmAction({ message: 'Are you sure you want to delete this record?' }))) return
    const record = records.find(r => r.id === id)
    if (record) {
      addRecycleItem({
        type: 'transactions',
        table: 'profit_withdrawals',
        title: record.shareholder_name || '-',
        subtitle: `${record.profit_month || ''}/${record.profit_year || ''}`,
        amount: Number(record.amount || 0),
        data: record,
      })
    }
    await supabase.from('profit_withdrawals').delete().eq('id', id)
    toast.success(t('common_deleted'))
    loadAll()
  }

  function resetForm() {
    setEditingId(null)
    setForm({
      date: new Date().toISOString().split('T')[0],
      shareholder_id: '', shareholder_name: '',
      amount: 0, account_id: '', account_name: '',
      profit_month: new Date().getMonth() + 1,
      profit_year: new Date().getFullYear(), notes: ''
    })
    setShowModal(false)
  }

  const byOwner: Record<string, number> = {}
  records.forEach(r => { byOwner[r.shareholder_name] = (byOwner[r.shareholder_name] || 0) + Number(r.amount) })
  const totalWithdrawn = records.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="p-6">
      <PageHeader title={t('profitWithdraw_title')} subtitle={t('profitWithdraw_title')} actions={<button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} /> {t('profitWithdraw_new')}</button>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card col-span-1"><p className="text-xs text-slate-500">{t('profitWithdraw_totalWithdrawal')}</p><p className="text-2xl font-bold text-brand-red mt-1">{formatCurr(totalWithdrawn)}</p></div>
        <div className="card col-span-3">
          <p className="text-xs text-slate-500 font-medium mb-3">{t('profitWithdraw_ownerSummary')}</p>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(byOwner).map(([name, amount]) => (
              <div key={name} className="flex justify-between text-sm p-2 bg-slate-50 rounded-lg">
                <span className="text-slate-600">{name}</span>
                <span className="font-semibold text-brand-red">{formatCurr(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">{t('profitWithdraw_list')}</div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4 w-12">#</th>
              <th className="text-left py-2 px-4">{t('profitWithdraw_colDate')}</th>
              <th className="text-left py-2 px-4">{t('profitWithdraw_colOwner')}</th>
              <th className="text-right py-2 px-4">{t('profitWithdraw_colAmount')}</th>
              <th className="text-left py-2 px-4">{t('profitWithdraw_colForMonth')}</th>
              <th className="text-left py-2 px-4">{t('profitWithdraw_colAccount')}</th>
              <th className="text-left py-2 px-4">{t('profitWithdraw_colNotes')}</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, index) => (
              <tr key={r.id} className="table-row">
                <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                <td className="py-2.5 px-4">{formatDate(r.date)}</td>
                <td className="py-2.5 px-4 font-medium">{r.shareholder_name}</td>
                <td className="py-2.5 px-4 text-right text-brand-red font-medium">{formatCurr(r.amount)}</td>
                <td className="py-2.5 px-4 text-slate-500">{monthName(r.profit_month)} {r.profit_year}</td>
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
            {records.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('profitWithdraw_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? t('profitWithdraw_editTitle') : t('profitWithdraw_newTitle')}>
        <div className="space-y-3">
          <div><label className="label">{t('common_date')}</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div>
            <label className="label">{t('common_owner')}</label>
            <select className="input" value={form.shareholder_id} onChange={e => setForm({ ...form, shareholder_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {shareholders.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('profitWithdraw_amountLabel')}</label><input type="number" min="0" className="input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('profitWithdraw_whichMonth')}</label>
              <select className="input" value={form.profit_month} onChange={e => setForm({ ...form, profit_month: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>
                ))}
              </select>
            </div>
            <div><label className="label">{t('common_year')}</label><input type="number" className="input" value={form.profit_year} onChange={e => setForm({ ...form, profit_year: Number(e.target.value) })} /></div>
          </div>
          <div>
            <label className="label">{t('invest_colAccount')}</label>
            <select className="input" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('common_note')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {t('common_save')}</button>
            <button onClick={resetForm} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
