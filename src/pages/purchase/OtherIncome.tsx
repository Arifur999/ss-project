import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Eye, FileText, Pencil, Plus, RefreshCw, Save, Search, Trash2, Users, WalletCards } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import { supabase } from '../../lib/supabase'
import { isMissingTableError } from '../../lib/supabaseErrors'
import { readOtherIncomeFallbackRows, sortOtherIncomeRows, writeOtherIncomeFallbackRows } from '../../lib/otherIncomeFallback'
import { formatDate } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import toast from 'react-hot-toast'

type IncomeType = 'supplier' | 'other'
type DateFilter = 'all' | 'thisMonth' | 'custom'

type OtherIncomeRow = {
  id: string
  date: string
  income_type: IncomeType
  supplier_id: string | null
  supplier_name: string
  source_name: string
  amount: number
  account_id: string
  account_name: string
  notes: string
}

const today = new Date().toISOString().split('T')[0]

function monthStart() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

const emptyForm = {
  date: today,
  income_type: 'supplier' as IncomeType,
  supplier_id: '',
  source_name: '',
  amount: 0,
  account_id: '',
  notes: '',
}

export default function OtherIncome() {
  const { user } = useAuth()
  const { formatCurr } = useLang()
  const [rows, setRows] = useState<OtherIncomeRow[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [viewItem, setViewItem] = useState<OtherIncomeRow | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | IncomeType>('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [customStart, setCustomStart] = useState(monthStart())
  const [customEnd, setCustomEnd] = useState(today)
  const [form, setForm] = useState(emptyForm)
  const [tableReady, setTableReady] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [incomeRes, supplierRes, accountRes] = await Promise.all([
      supabase.from('other_incomes').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
      supabase.from('accounts').select('id, name').eq('is_active', true).order('sort_order'),
    ])

    const missingOtherIncomeTable = isMissingTableError(incomeRes.error, 'other_incomes')
    setTableReady(!missingOtherIncomeTable)

    if (incomeRes.error && !missingOtherIncomeTable) toast.error(incomeRes.error.message)
    if (supplierRes.error) toast.error(supplierRes.error.message)
    if (accountRes.error) toast.error(accountRes.error.message)

    setRows(missingOtherIncomeTable
      ? sortOtherIncomeRows(readOtherIncomeFallbackRows(user?.id))
      : (incomeRes.data || []).map((item: any) => ({ ...item, amount: Number(item.amount || 0) })))
    setSuppliers(supplierRes.data || [])
    setAccounts(accountRes.data || [])
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
  }

  function openNew() {
    resetForm()
    setShowModal(true)
  }

  function openEdit(item: OtherIncomeRow) {
    setEditingId(item.id)
    setForm({
      date: item.date || today,
      income_type: item.income_type,
      supplier_id: item.supplier_id || '',
      source_name: item.source_name || '',
      amount: Number(item.amount || 0),
      account_id: item.account_id || '',
      notes: item.notes || '',
    })
    setShowModal(true)
  }

  async function save() {
    if (!form.date || !form.account_id || !form.amount || form.amount <= 0) {
      toast.error('Please fill all required fields')
      return
    }
    if (form.income_type === 'supplier' && !form.supplier_id) {
      toast.error('Please select supplier')
      return
    }
    if (form.income_type === 'other' && !form.source_name.trim()) {
      toast.error('Please enter source name')
      return
    }

    const supplier = suppliers.find(item => item.id === form.supplier_id)
    const account = accounts.find(item => item.id === form.account_id)
    const payload = {
      date: form.date,
      income_type: form.income_type,
      supplier_id: form.income_type === 'supplier' ? form.supplier_id : null,
      supplier_name: form.income_type === 'supplier' ? supplier?.name || '' : '',
      source_name: form.income_type === 'other' ? form.source_name.trim() : '',
      amount: form.amount,
      account_id: form.account_id,
      account_name: account?.name || '',
      notes: form.notes,
    }

    if (!tableReady) {
      saveFallback(payload)
      return
    }

    const result = editingId
      ? await supabase.from('other_incomes').update(payload).eq('id', editingId)
      : await supabase.from('other_incomes').insert({ ...payload, created_by: user?.id })

    if (result.error) {
      if (isMissingTableError(result.error, 'other_incomes')) {
        setTableReady(false)
        saveFallback(payload)
        return
      }
      toast.error(result.error.message)
      return
    }

    toast.success(editingId ? 'Other income updated' : 'Other income saved')
    setShowModal(false)
    resetForm()
    await loadAll()
  }

  function saveFallback(payload: Omit<OtherIncomeRow, 'id'>) {
    const previousRows = readOtherIncomeFallbackRows(user?.id)
    const nextRows = editingId
      ? previousRows.map(row => row.id === editingId ? { ...row, ...payload, amount: Number(payload.amount || 0) } : row)
      : [
          {
            ...payload,
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            amount: Number(payload.amount || 0),
          },
          ...previousRows,
        ]

    const sortedRows = sortOtherIncomeRows(nextRows)
    writeOtherIncomeFallbackRows(user?.id, sortedRows)
    setRows(sortedRows)
    toast.success(editingId ? 'Other income updated' : 'Other income saved')
    setShowModal(false)
    resetForm()
  }

  async function deleteItem(item: OtherIncomeRow) {
    if (!tableReady) {
      if (!(await confirmAction({ message: 'Delete this other income transaction?' }))) return
      const nextRows = readOtherIncomeFallbackRows(user?.id).filter(row => row.id !== item.id)
      writeOtherIncomeFallbackRows(user?.id, nextRows)
      setRows(sortOtherIncomeRows(nextRows))
      toast.success('Other income deleted')
      return
    }

    if (!(await confirmAction({ message: 'Delete this other income transaction?' }))) return
    const { error } = await supabase.from('other_incomes').delete().eq('id', item.id)
    if (error) {
      if (isMissingTableError(error, 'other_incomes')) {
        setTableReady(false)
        const nextRows = readOtherIncomeFallbackRows(user?.id).filter(row => row.id !== item.id)
        writeOtherIncomeFallbackRows(user?.id, nextRows)
        setRows(sortOtherIncomeRows(nextRows))
        toast.success('Other income deleted')
        return
      }
      toast.error(error.message)
      return
    }
    toast.success('Other income deleted')
    await loadAll()
  }

  function resetFilters() {
    setSearch('')
    setDateFilter('all')
    setTypeFilter('all')
    setAccountFilter('all')
    setCustomStart(monthStart())
    setCustomEnd(today)
  }

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter(row => {
      const source = row.income_type === 'supplier' ? row.supplier_name : row.source_name
      const matchesSearch = !needle || [source, row.notes, row.account_name].some(value => (value || '').toLowerCase().includes(needle))
      const matchesType = typeFilter === 'all' || row.income_type === typeFilter
      const matchesAccount = accountFilter === 'all' || row.account_id === accountFilter
      const matchesDate = dateFilter === 'all'
        || (dateFilter === 'thisMonth' && row.date >= monthStart() && row.date <= today)
        || (dateFilter === 'custom' && row.date >= customStart && row.date <= customEnd)
      return matchesSearch && matchesType && matchesAccount && matchesDate
    })
  }, [rows, search, dateFilter, typeFilter, accountFilter, customStart, customEnd])

  const totals = useMemo(() => {
    const total = filteredRows.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const supplier = filteredRows.filter(item => item.income_type === 'supplier').reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const other = filteredRows.filter(item => item.income_type === 'other').reduce((sum, item) => sum + Number(item.amount || 0), 0)
    return { total, supplier, other, count: filteredRows.length }
  }, [filteredRows])

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <PageHeader
        title="Other Income"
        subtitle="Supplier commission and other income received"
        actions={
          <button
            onClick={openNew}
            className="btn-primary"
          >
            <Plus size={16} /> New Transaction
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total Other Income" value={formatCurr(totals.total)} subtitle="Selected range" icon={<WalletCards size={24} />} tone="blue" />
        <SummaryCard title="Supplier Commission" value={formatCurr(totals.supplier)} subtitle="Selected range" icon={<Users size={24} />} tone="green" />
        <SummaryCard title="Other Source Income" value={formatCurr(totals.other)} subtitle="Selected range" icon={<FileText size={24} />} tone="orange" />
        <SummaryCard title="Total Transactions" value={String(totals.count)} subtitle="Selected range" icon={<FileText size={24} />} tone="purple" />
      </div>

      <section className="card overflow-hidden p-0">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-base font-bold text-slate-800">Other Income List</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 lg:grid-cols-[minmax(220px,1fr)_160px_150px_170px_auto]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by supplier / source / note..." />
          </div>
          <select className="input" value={dateFilter} onChange={e => setDateFilter(e.target.value as DateFilter)}>
            <option value="all">All Date</option>
            <option value="thisMonth">This Month</option>
            <option value="custom">Date Range</option>
          </select>
          <select className="input" value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | IncomeType)}>
            <option value="all">All Type</option>
            <option value="supplier">Supplier</option>
            <option value="other">Other</option>
          </select>
          <select className="input" value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
            <option value="all">All Account</option>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <button onClick={resetFilters} className="btn-secondary justify-center"><RefreshCw size={15} /> Reset</button>
          {dateFilter === 'custom' && (
            <div className="grid grid-cols-1 gap-3 lg:col-span-5 sm:grid-cols-2">
              <div className="relative">
                <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="date" className="input pl-9" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              </div>
              <div className="relative">
                <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="date" className="input pl-9" value={customEnd} min={customStart} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left w-12">#</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Supplier / Source</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-left">Note</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No income records found</td></tr>
              ) : filteredRows.map((item, index) => (
                <tr key={item.id} className="table-row">
                  <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(item.date)}</td>
                  <td className="px-4 py-3">
                    <span className={item.income_type === 'supplier' ? 'badge-green' : 'badge-orange'}>
                      {item.income_type === 'supplier' ? 'Supplier' : 'Other'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{item.income_type === 'supplier' ? item.supplier_name : item.source_name}</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-green">{formatCurr(Number(item.amount || 0))}</td>
                  <td className="px-4 py-3 text-slate-500">{item.account_name}</td>
                  <td className="px-4 py-3 text-slate-400">{item.notes || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setViewItem(item)} className="rounded-lg bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100" title="View"><Eye size={15} /></button>
                      <button onClick={() => openEdit(item)} className="rounded-lg bg-green-50 p-1.5 text-brand-green hover:bg-green-100" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => deleteItem(item)} className="rounded-lg bg-red-50 p-1.5 text-brand-red hover:bg-red-100" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 text-xs font-medium text-slate-500">
          Showing {filteredRows.length} of {rows.length} transactions
        </div>
      </section>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm() }} title={editingId ? 'Edit Transaction' : 'New Transaction'} size="xl">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Date <span className="text-brand-red">*</span></label>
              <input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Type <span className="text-brand-red">*</span></label>
              <select className="input" value={form.income_type} onChange={e => setForm({ ...form, income_type: e.target.value as IncomeType, supplier_id: '', source_name: '' })}>
                <option value="supplier">Supplier</option>
                <option value="other">Other</option>
              </select>
            </div>
            {form.income_type === 'supplier' ? (
              <div>
                <label className="label">Supplier <span className="text-brand-red">*</span></label>
                <select className="input" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">Select Supplier</option>
                  {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="label">Source <span className="text-brand-red">*</span></label>
                <input className="input" value={form.source_name} onChange={e => setForm({ ...form, source_name: e.target.value })} placeholder="Enter income source" />
              </div>
            )}
            <div>
              <label className="label">Amount <span className="text-brand-red">*</span></label>
              <input type="number" min="0" className="input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} placeholder="Enter amount" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Receiving Account <span className="text-brand-red">*</span></label>
              <select className="input" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Select Account</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input min-h-[92px]" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Enter notes (optional)" />
            </div>
          </div>
          <aside className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700">
            <div className="mb-3 flex items-center gap-2 font-bold text-blue-700"><FileText size={17} /> Note:</div>
            <div className="space-y-3 text-xs leading-6">
              <p><span className="font-bold text-brand-green">Supplier:</span> Supplier Commission</p>
              <p><span className="font-bold text-brand-green">Other:</span> Any other income</p>
              <p>Make sure you select the correct account where the amount is received.</p>
            </div>
          </aside>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button onClick={() => { setShowModal(false); resetForm() }} className="btn-secondary">Cancel</button>
          <button onClick={save} className="btn-primary"><Save size={16} /> Save Transaction</button>
        </div>
      </Modal>

      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title="Transaction Details">
        {viewItem && (
          <div className="space-y-3 text-sm">
            <Detail label="Date" value={formatDate(viewItem.date)} />
            <Detail label="Type" value={viewItem.income_type === 'supplier' ? 'Supplier' : 'Other'} />
            <Detail label="Supplier / Source" value={viewItem.income_type === 'supplier' ? viewItem.supplier_name : viewItem.source_name} />
            <Detail label="Amount" value={formatCurr(Number(viewItem.amount || 0))} />
            <Detail label="Account" value={viewItem.account_name} />
            <Detail label="Note" value={viewItem.notes || '-'} />
          </div>
        )}
      </Modal>
    </div>
  )
}

function SummaryCard({ title, value, subtitle, icon, tone }: { title: string; value: string; subtitle: string; icon: React.ReactNode; tone: 'blue' | 'green' | 'orange' | 'purple' }) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50/60 text-blue-700',
    green: 'border-green-100 bg-green-50/60 text-brand-green',
    orange: 'border-orange-100 bg-orange-50/60 text-orange-600',
    purple: 'border-purple-100 bg-purple-50/60 text-purple-600',
  }

  return (
    <section className={`rounded-lg border bg-white p-5 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold">{title}</p>
          <p className="mt-2 break-words text-2xl font-black tabular-nums text-slate-900">{value}</p>
          <p className="mt-2 text-xs font-medium text-slate-500">{subtitle}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/80">
          {icon}
        </div>
      </div>
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value}</span>
    </div>
  )
}
