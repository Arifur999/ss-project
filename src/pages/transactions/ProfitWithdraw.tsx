import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Save, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, todayISO } from '../../lib/utils'
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

export default function ProfitWithdraw() {
  const { t, formatCurr, monthName } = useLang()
  const [records, setRecords] = useState<any[]>([])
  const [shareholders, setShareholders] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const { user } = useAuth()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    date: todayISO(),
    shareholder_id: '', shareholder_name: '',
    amount: 0, account_id: '', account_name: '',
    profit_month: new Date().getMonth() + 1,
    profit_year: new Date().getFullYear(),
    to_month: new Date().getMonth() + 1,
    to_year: new Date().getFullYear(), notes: ''
  })
  const [period, setPeriod] = useState<Period>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

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
      profit_month: record.profit_month || new Date().getMonth() + 1,
      profit_year: record.profit_year || new Date().getFullYear(),
      to_month: record.to_month || record.profit_month || new Date().getMonth() + 1,
      to_year: record.to_year || record.profit_year || new Date().getFullYear(),
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
    const { error } = await supabase.from('profit_withdrawals').delete().eq('id', id)
    if (error) { toast.error(error.message || t('common_error')); return }
    toast.success(t('common_deleted'))
    loadAll()
  }

  function resetForm() {
    setEditingId(null)
    setForm({
      date: todayISO(),
      shareholder_id: '', shareholder_name: '',
      amount: 0, account_id: '', account_name: '',
      profit_month: new Date().getMonth() + 1,
      profit_year: new Date().getFullYear(),
      to_month: new Date().getMonth() + 1,
      to_year: new Date().getFullYear(), notes: ''
    })
    setShowModal(false)
  }

  const filtered = useMemo(() => records.filter(r => inPeriod(r.date, period, fromDate, toDate)), [records, period, fromDate, toDate])
  const totalWithdrawn = filtered.reduce((s, r) => s + Number(r.amount), 0)

  // "Aug 2025" or "Aug 2025 → Feb 2026" when a range is set.
  const monthRangeText = (r: any) => {
    const from = r.profit_month ? `${monthName(r.profit_month)} ${r.profit_year || ''}`.trim() : ''
    const to = r.to_month ? `${monthName(r.to_month)} ${r.to_year || ''}`.trim() : ''
    if (from && to && (r.profit_month !== r.to_month || r.profit_year !== r.to_year)) return `${from} → ${to}`
    return from || to || '-'
  }

  function handlePrint() {
    printTable({
      title: t('profitWithdraw_title'),
      subtitle: periodLabel(period, fromDate, toDate),
      columns: [
        { label: '#' }, { label: 'Date' }, { label: 'Owner' },
        { label: 'Amount', align: 'right' }, { label: 'For Month' },
        { label: 'Account' }, { label: 'Notes' },
      ],
      rows: filtered.map((r, i) => [
        i + 1, formatDate(r.date), r.shareholder_name || '-',
        formatCurr(r.amount), monthRangeText(r),
        r.account_name || '-', r.notes || '',
      ]),
      totalRow: ['', 'Total', '', formatCurr(totalWithdrawn), '', '', ''],
    })
  }

  return (
    <div className="p-6">
      <PageHeader title={t('profitWithdraw_title')} subtitle={t('profitWithdraw_title')} actions={<button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} /> {t('profitWithdraw_new')}</button>} />

      <div className="card overflow-x-auto p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <span className="font-semibold text-slate-800">{t('profitWithdraw_list')}</span>
          <PeriodFilter period={period} setPeriod={setPeriod} from={fromDate} setFrom={setFromDate} to={toDate} setTo={setToDate} onPrint={handlePrint} />
        </div>
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
            {filtered.map((r, index) => (
              <tr key={r.id} className="table-row">
                <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                <td className="py-2.5 px-4">{formatDate(r.date)}</td>
                <td className="py-2.5 px-4 font-medium">{r.shareholder_name}</td>
                <td className="py-2.5 px-4 text-right text-brand-red font-medium">{formatCurr(r.amount)}</td>
                <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{monthRangeText(r)}</td>
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
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('profitWithdraw_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? t('profitWithdraw_editTitle') : t('profitWithdraw_newTitle')}>
        <div className="space-y-3">
          <div><label className="label" htmlFor="profit-withdraw-f1">{t('common_date')}</label><input id="profit-withdraw-f1" type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div>
            <label className="label">{t('common_owner')}</label>
            <SearchableSelect
              value={form.shareholder_id}
              onChange={val => setForm({ ...form, shareholder_id: val })}
              options={shareholders.map(s => ({ value: s.id, label: s.name }))}
              placeholder={t('common_select')}
            />
          </div>
          <div><label className="label" htmlFor="profit-withdraw-f2">{t('profitWithdraw_amountLabel')}</label><input id="profit-withdraw-f2" type="number" min="0" className="input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div>
            <label className="label" htmlFor="profit-withdraw-f3">{t('profitWithdraw_whichMonth', 'From month')} → To month</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid grid-cols-2 gap-2">
                <select id="profit-withdraw-f3" className="input" value={form.profit_month} onChange={e => setForm({ ...form, profit_month: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
                </select>
                <input type="number" className="input" value={form.profit_year} onChange={e => setForm({ ...form, profit_year: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={form.to_month} onChange={e => setForm({ ...form, to_month: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
                </select>
                <input type="number" className="input" value={form.to_year} onChange={e => setForm({ ...form, to_year: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <div>
            <label className="label">{t('invest_colAccount')}</label>
            <SearchableSelect
              value={form.account_id}
              onChange={val => setForm({ ...form, account_id: val })}
              options={accounts.map(a => ({ value: a.id, label: a.name }))}
              placeholder={t('common_select')}
            />
          </div>
          <div><label className="label" htmlFor="profit-withdraw-f4">{t('common_note')}</label><textarea id="profit-withdraw-f4" className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {t('common_save')}</button>
            <button onClick={resetForm} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
