import React, { useState, useEffect } from 'react'
import { Pencil, Plus, Printer, Save, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'

export default function ExpenseTransactions() {
  const { t, formatCurr } = useLang()
  const [expenses, setExpenses] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const { user } = useAuth()
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    category_id: '', category_name: '',
    amount: 0, account_id: '', account_name: '',
    notes: ''
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [expRes, catRes, accRes] = await Promise.all([
      supabase.from('expenses').select('*').order('date', { ascending: false }).limit(200),
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
    ])
    setExpenses(expRes.data || [])
    setCategories(catRes.data || [])
    setAccounts(accRes.data || [])
  }

  function openModal(item?: any) {
    setEditItem(item || null)
    setForm(item ? {
      date: item.date,
      category_id: item.category_id || '', category_name: item.category_name || '',
      amount: Number(item.amount || 0), account_id: item.account_id || '', account_name: item.account_name || '',
      notes: item.notes || ''
    } : {
      date: new Date().toISOString().split('T')[0],
      category_id: '', category_name: '',
      amount: 0, account_id: '', account_name: '',
      notes: ''
    })
    setShowModal(true)
  }

  async function save() {
    if (!form.category_id || !form.account_id || !form.amount) return toast.error(t('expTx_fillAllFields'))
    const cat = categories.find(c => c.id === form.category_id)
    const acc = accounts.find(a => a.id === form.account_id)
    const payload = {
      ...form,
      category_name: cat?.name || '',
      account_name: acc?.name || '',
    }
    if (editItem) {
      await supabase.from('expenses').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('expenses').insert({ ...payload, created_by: user?.id })
    }
    toast.success(editItem ? t('common_updated') : t('expTx_saved'))
    setShowModal(false)
    resetForm()
    loadAll()
  }

  async function deleteExpense(item: any) {
    addRecycleItem({
      type: 'expenses',
      table: 'expenses',
      title: item.category_name || '-',
      subtitle: item.account_name || 'Expense',
      amount: Number(item.amount || 0),
      data: item,
    })
    await supabase.from('expenses').delete().eq('id', item.id)
    toast.success(t('common_deleted'))
    loadAll()
  }

  function resetForm() {
    setEditItem(null)
    setForm({
      date: new Date().toISOString().split('T')[0],
      category_id: '', category_name: '',
      amount: 0, account_id: '', account_name: '',
      notes: ''
    })
  }

  const filtered = expenses.filter(e => {
    const matchSearch = !search || e.category_name.toLowerCase().includes(search.toLowerCase()) || e.notes?.toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCat || e.category_id === filterCat
    const matchFromDate = !fromDate || e.date >= fromDate
    const matchToDate = !toDate || e.date <= toDate
    return matchSearch && matchCat && matchFromDate && matchToDate
  })

  const totalShown = filtered.reduce((s, e) => s + Number(e.amount || 0), 0)

  function printTransactions() {
    window.print()
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <PageHeader
        title={t('expTx_title')}
        subtitle={t('expTx_title')}
        actions={<button onClick={() => openModal()} className="btn-primary"><Plus size={16} /> {t('expTx_new')}</button>}
      />

      <div className="mb-4 flex flex-shrink-0 flex-col gap-3 xl:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('expTx_searchPlaceholder')} className="input pl-9" />
        </div>
        <input type="date" className="input xl:w-40" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <input type="date" className="input xl:w-40" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="input w-48">
          <option value="">{t('expTx_allCategories')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" onClick={printTransactions} className="btn-secondary justify-center xl:w-28">
          <Printer size={15} /> Print
        </button>
        <div className="card px-4 py-2 flex items-center gap-2 min-w-fit">
          <span className="text-xs text-slate-500">{t('expTx_totalLabel')}</span>
          <span className="font-bold text-brand-red">{formatCurr(totalShown)}</span>
        </div>
      </div>

      <section className="expense-transactions-print">
        <h1>Expense Transactions</h1>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{t('expTx_colDate')}</th>
              <th>{t('expTx_colCategory')}</th>
              <th>{t('expTx_colAmount')}</th>
              <th>{t('expTx_colAccount')}</th>
              <th>{t('expTx_colNotes')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((expense, index) => (
              <tr key={`print-${expense.id}`}>
                <td>{index + 1}</td>
                <td>{formatDate(expense.date)}</td>
                <td>{expense.category_name || '-'}</td>
                <td>{formatCurr(expense.amount)}</td>
                <td>{expense.account_name || '-'}</td>
                <td>{expense.notes || '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6}>{t('expTx_noRecords')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <colgroup>
              <col className="w-12" />
              <col className="w-[108px]" />
              <col className="w-[220px]" />
              <col className="w-[130px]" />
              <col className="w-[180px]" />
              <col />
              <col className="w-[120px]" />
            </colgroup>
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4 w-12">#</th>
              <th className="whitespace-nowrap text-left py-2 px-4">{t('expTx_colDate')}</th>
              <th className="text-left py-2 px-4">{t('expTx_colCategory')}</th>
              <th className="text-right py-2 px-4">{t('expTx_colAmount')}</th>
              <th className="text-left py-2 px-4">{t('expTx_colAccount')}</th>
              <th className="text-left py-2 px-4">{t('expTx_colNotes')}</th>
              <th className="text-right py-2 px-4">{t('common_actions')}</th>
            </tr>
          </thead>
          </table>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <colgroup>
              <col className="w-12" />
              <col className="w-[108px]" />
              <col className="w-[220px]" />
              <col className="w-[130px]" />
              <col className="w-[180px]" />
              <col />
              <col className="w-[120px]" />
            </colgroup>
          <tbody>
            {filtered.map((e, index) => {
              const cat = categories.find(c => c.id === e.category_id)
              return (
                <tr key={e.id} className="table-row">
                  <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                  <td className="whitespace-nowrap py-2.5 px-4">{formatDate(e.date)}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      {cat && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />}
                      <span className="font-medium">{e.category_name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-brand-red">{formatCurr(e.amount)}</td>
                  <td className="py-2.5 px-4 text-slate-500">{e.account_name}</td>
                  <td className="py-2.5 px-4 text-slate-400">{e.notes}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openModal(e)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
                        title={t('common_edit')}
                        aria-label={t('common_edit')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteExpense(e)}
                        className="p-1.5 text-slate-400 hover:text-brand-red transition-colors"
                        title={t('common_delete')}
                        aria-label={t('common_delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400">{t('expTx_noRecords')}</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm() }} title={editItem ? t('common_edit') : t('expTx_newTitle')}>
        <div className="space-y-3">
          <div><label className="label">{t('common_date')}</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div>
            <label className="label">{t('common_category')}</label>
            <select className="input" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('expTx_amountLabel')}</label><input type="number" min="0" className="input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div>
            <label className="label">{t('expTx_paymentAccount')}</label>
            <select className="input" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('common_note')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {t('common_save')}</button>
            <button onClick={() => { setShowModal(false); resetForm() }} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
