import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Save, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import PeriodFilter from '../../components/PeriodFilter'
import Modal from '../../components/Modal'
import SearchableSelect from '../../components/SearchableSelect'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'
import { inPeriod, periodLabel, type Period } from '../../lib/periodFilter'
import { printTable } from '../../lib/printTable'

export default function InvestWithdraw() {
  const { t, formatCurr } = useLang()
  const [records, setRecords] = useState<any[]>([])
  const [shareholders, setShareholders] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const { user } = useAuth()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{ date: string; type: 'invest' | 'withdraw'; shareholder_id: string; amount: number; account_id: string; notes: string }>({ date: new Date().toISOString().split('T')[0], type: 'invest', shareholder_id: '', amount: 0, account_id: '', notes: '' })
  const [period, setPeriod] = useState<Period>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

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
    if (!form.amount || Number(form.amount) <= 0) { toast.error(t('invest_fillAllFields')); return }
    const sh = shareholders.find(s => s.id === form.shareholder_id)
    const acc = accounts.find(a => a.id === form.account_id)
    const amt = Number(form.amount || 0)

    const payload = {
      date: form.date,
      shareholder_id: form.shareholder_id,
      shareholder_name: sh?.name || '',
      invest_amount: form.type === 'invest' ? amt : 0,
      withdraw_amount: form.type === 'withdraw' ? amt : 0,
      account_id: form.account_id,
      account_name: acc?.name || '',
      notes: form.notes,
    }

    if (editingId) {
      await supabase.from('investments').update(payload).eq('id', editingId)
    } else {
      await supabase.from('investments').insert({ ...payload, created_by: user?.id })
    }

    toast.success(t('invest_saved')); resetForm(); loadAll()
  }

  function editRecord(record: any) {
    setEditingId(record.id)
    setForm({
      date: record.date,
      type: Number(record.withdraw_amount || 0) > 0 ? 'withdraw' : 'invest',
      shareholder_id: record.shareholder_id,
      amount: Number(record.withdraw_amount || 0) > 0 ? Number(record.withdraw_amount) : Number(record.invest_amount || 0),
      account_id: record.account_id,
      notes: record.notes,
    })
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
    setForm({ date: new Date().toISOString().split('T')[0], type: 'invest', shareholder_id: '', amount: 0, account_id: '', notes: '' })
    setShowModal(false)
  }

  const filtered = useMemo(() => records.filter(r => inPeriod(r.date, period, fromDate, toDate)), [records, period, fromDate, toDate])
  const totalInvest = filtered.reduce((s, r) => s + Number(r.invest_amount || 0), 0)
  const totalWithdraw = filtered.reduce((s, r) => s + Number(r.withdraw_amount || 0), 0)

  function handlePrint() {
    printTable({
      title: t('invest_subtitle'),
      subtitle: periodLabel(period, fromDate, toDate),
      columns: [
        { label: '#' }, { label: 'Date' }, { label: 'Shareholder' },
        { label: 'Investment', align: 'right' }, { label: 'Withdrawal', align: 'right' },
        { label: 'Account' }, { label: 'Notes' },
      ],
      rows: filtered.map((r, i) => [
        i + 1, formatDate(r.date), r.shareholder_name || '-',
        r.invest_amount > 0 ? formatCurr(r.invest_amount) : '-',
        r.withdraw_amount > 0 ? formatCurr(r.withdraw_amount) : '-',
        r.account_name || '-', r.notes || '',
      ]),
      totalRow: ['', 'Total', '', formatCurr(totalInvest), formatCurr(totalWithdraw), '', ''],
    })
  }

  return (
    <div className="p-6">
      <PageHeader title={t('invest_subtitle')} subtitle={t('invest_title')} actions={<button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} /> {t('invest_new')}</button>} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card"><p className="text-xs text-slate-500">{t('invest_totalInvestment')}</p><p className="text-2xl font-bold text-brand-green mt-1">{formatCurr(totalInvest)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('invest_totalWithdrawal')}</p><p className="text-2xl font-bold text-brand-red mt-1">{formatCurr(totalWithdraw)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('invest_netInvestment')}</p><p className={`text-2xl font-bold mt-1 ${totalInvest - totalWithdraw >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>{formatCurr(totalInvest - totalWithdraw)}</p></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <span className="font-semibold text-slate-800">{t('invest_txList')}</span>
          <PeriodFilter period={period} setPeriod={setPeriod} from={fromDate} setFrom={setFromDate} to={toDate} setTo={setToDate} onPrint={handlePrint} />
        </div>
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
            {filtered.map((r, index) => (
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
                      <button onClick={() => editRecord(r)} className="text-slate-500 hover:text-slate-700"><Edit2 size={14} /></button>
                      <button onClick={() => deleteRecord(r.id)} className="text-red-500 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('invest_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? t('invest_editTitle') : t('invest_newTitle')}>
        <div className="space-y-3">
          <div><label className="label">{t('common_date')}</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div>
            <label className="label">{t('common_type', 'Type')}</label>
            <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'invest' | 'withdraw' })}>
              {/* Its own labels, not the summary cards' - one entry is an
                  investment, not a "Total Investment". The cards above keep
                  the "Total" wording, where it is correct. */}
              <option value="invest">{t('invest_typeInvestment', 'Investment')}</option>
              <option value="withdraw">{t('invest_typeWithdrawal', 'Withdrawal')}</option>
            </select>
          </div>
          <div>
            <label className="label">{t('invest_colShareholder')}</label>
            <SearchableSelect
              value={form.shareholder_id}
              onChange={val => setForm({ ...form, shareholder_id: val })}
              options={shareholders.map(s => ({ value: s.id, label: s.name }))}
              placeholder={t('common_select')}
            />
          </div>
          <div><label className="label">{t('common_amount', 'Amount')} (৳)</label><input type="number" min="0" className="input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div>
            <label className="label">{t('invest_colAccount')}</label>
            <SearchableSelect
              value={form.account_id}
              onChange={val => setForm({ ...form, account_id: val })}
              options={accounts.map(a => ({ value: a.id, label: a.name }))}
              placeholder={t('common_select')}
            />
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
