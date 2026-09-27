import React, { useEffect, useMemo, useState } from 'react'
import { PlusIcon as Plus, ReceiptIcon as Receipt, MagnifyingGlassIcon as Search } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import TableSkeleton from '../../components/TableSkeleton'
import Modal from '../../components/Modal'
import SearchableSelect from '../../components/SearchableSelect'
import PeriodFilter from '../../components/PeriodFilter'
import { NoValue } from '../../components/CellValue'
import { supabase } from '../../lib/supabase'
import { formatDate, todayISO } from '../../lib/utils'
import { filterRows } from '../../lib/searchRows'
import { inPeriod, type Period } from '../../lib/periodFilter'
import { useLang } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import {
  addDamageTransaction, getDamageEntries, getDamageTransactions,
  type DamageEntry,
} from '../../services/damage.services'

type Row = {
  id: string
  date: string
  direction: 'out' | 'in'
  label: string
  amount: number
  account_name: string
  account_id: string | null
  entry_id: string
  notes: string
}

/**
 * The money either side of a breakage.
 *
 * These rows live in `expenses` and `other_incomes`, not in a table of
 * Damage's own, which is why the Balance Dashboard, the P&L and the reports
 * already know about them. This page is the view of them filtered back down
 * to the entry that caused them.
 */
export default function DamageTransactions() {
  const { formatCurr } = useLang()
  const { touchOwnerActivity } = useAuth()

  const [rows, setRows] = useState<Row[]>([])
  const [entries, setEntries] = useState<DamageEntry[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    kind: 'repair_cost' as 'repair_cost' | 'supplier_refund',
    damage_entry_id: '',
    date: todayISO(),
    amount: 0,
    account_id: '',
    notes: '',
  })

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [money, entryRows, accountRes] = await Promise.all([
        getDamageTransactions(),
        getDamageEntries(),
        supabase.from('accounts').select('id, name').eq('is_active', true).order('sort_order'),
      ])

      const docNoById = new Map(entryRows.map(entry => [entry.id, entry.doc_no]))
      const asRow = (raw: any, direction: 'out' | 'in'): Row => ({
        id: String(raw.id),
        date: String(raw.date || ''),
        direction,
        label: direction === 'out' ? String(raw.category_name || '') : String(raw.source_name || ''),
        amount: Number(raw.amount || 0),
        account_name: String(raw.account_name || ''),
        account_id: raw.account_id ?? null,
        entry_id: String(raw.damage_entry_id || ''),
        notes: String(raw.notes || ''),
      })

      const all = [
        ...money.expenses.map(raw => asRow(raw, 'out')),
        ...money.other_incomes.map(raw => asRow(raw, 'in')),
      ].map(row => ({ ...row, entry_id: docNoById.get(row.entry_id) || row.entry_id }))

      all.sort((a, b) => b.date.localeCompare(a.date))
      setRows(all)
      setEntries(entryRows || [])
      setAccounts(accountRes.data || [])
    } catch (error: any) {
      toast.error(error?.message || 'Could not load damage transactions')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!form.damage_entry_id) return toast.error('Which damage entry is this for?')
    if (form.amount <= 0) return toast.error('Enter an amount')
    if (!form.account_id) return toast.error('Choose the account the money moved through')

    try {
      setSaving(true)
      const account = accounts.find(row => row.id === form.account_id)
      await addDamageTransaction(form.damage_entry_id, {
        kind: form.kind,
        date: form.date,
        amount: form.amount,
        account_id: form.account_id,
        account_name: account?.name || '',
        notes: form.notes,
      })
      toast.success('Saved')
      void touchOwnerActivity(true)
      setShowModal(false)
      setForm({ kind: 'repair_cost', damage_entry_id: '', date: todayISO(), amount: 0, account_id: '', notes: '' })
      await loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Could not save this transaction')
    } finally {
      setSaving(false)
    }
  }

  const filtered = useMemo(() => {
    const byPeriod = rows.filter(row => inPeriod(row.date, period, fromDate, toDate))
    return filterRows(byPeriod, [
      (row: Row) => row.entry_id,
      (row: Row) => row.label,
      (row: Row) => row.account_name,
      (row: Row) => row.notes,
    ], search)
  }, [rows, search, period, fromDate, toDate])

  const paidOut = filtered.filter(row => row.direction === 'out').reduce((sum, row) => sum + row.amount, 0)
  const cameIn = filtered.filter(row => row.direction === 'in').reduce((sum, row) => sum + row.amount, 0)

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Damage Transactions"
        subtitle="Repairs paid for, refunds received, and goods written off"
        actions={<button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Add transaction</button>}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-xs text-slate-500">Paid out</p><p className="mt-1 text-2xl font-bold text-brand-red">{formatCurr(paidOut)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Recovered</p><p className="mt-1 text-2xl font-bold text-brand-green">{formatCurr(cameIn)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Net cost of damage</p><p className="mt-1 text-2xl font-bold text-slate-900">{formatCurr(paidOut - cameIn)}</p></div>
      </div>

      <div className="card p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[16rem] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Doc no, category or account" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <PeriodFilter period={period} setPeriod={setPeriod} from={fromDate} setFrom={setFromDate} to={toDate} setTo={setToDate} />
        </div>

        <TableScroller>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Damage</th>
                <th className="px-4 py-3 text-left">What for</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-right">Out</th>
                <th className="px-4 py-3 text-right">In</th>
                <th className="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={`${row.direction}-${row.id}`} className="table-row">
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(row.date)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">{row.entry_id || <NoValue />}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.label || <NoValue />}</td>
                  {/* A write-off has no account on purpose: the goods left, not
                      the cash, so it reaches the P&L and never the Balance. */}
                  <td className="px-4 py-2.5 text-slate-600">{row.account_name || <NoValue label="No cash moved" />}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-brand-red">
                    {row.direction === 'out' ? formatCurr(row.amount) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-brand-green">
                    {row.direction === 'in' ? formatCurr(row.amount) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{row.notes || <NoValue />}</td>
                </tr>
              ))}
              {loading && <TableSkeleton rows={6} cols={7} />}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <Receipt size={34} className="mx-auto mb-2 opacity-40" />
                    No damage money yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroller>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add damage transaction" size="md">
        <div className="space-y-4">
          <label className="block">
            <span className="label">What kind</span>
            <select className="input" value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as typeof form.kind })}>
              <option value="repair_cost">Repair cost - money out</option>
              <option value="supplier_refund">Supplier refund - money in</option>
            </select>
          </label>

          <div>
            <span className="label">Which damage <span className="text-brand-red">*</span></span>
            <SearchableSelect
              value={form.damage_entry_id}
              onChange={value => setForm({ ...form, damage_entry_id: value })}
              options={entries.map(entry => ({
                value: entry.id,
                label: `${entry.doc_no} - ${entry.damage_items.map(item => item.product_name).join(', ').slice(0, 44)}`,
              }))}
              placeholder="Choose the entry"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className="label">Date</span>
              <input type="date" className="input" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} />
            </label>
            <label>
              <span className="label">Amount</span>
              <input type="number" min={0} className="input text-right" value={form.amount || ''} onChange={event => setForm({ ...form, amount: Number(event.target.value) || 0 })} />
            </label>
          </div>

          <div>
            <span className="label">Account <span className="text-brand-red">*</span></span>
            <SearchableSelect
              value={form.account_id}
              onChange={value => setForm({ ...form, account_id: value })}
              options={accounts.map(row => ({ value: row.id, label: row.name }))}
              placeholder="Where the money moved"
            />
          </div>

          <label className="block">
            <span className="label">Notes</span>
            <input className="input" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
          </label>

          <div className="flex gap-2">
            <button className="btn-secondary flex-1 justify-center" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary flex-1 justify-center" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
