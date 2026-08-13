import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MoneyIcon as Banknote, ChatTextIcon as MessageSquareText, PencilSimpleIcon as Pencil, PlusIcon as Plus, ReceiptIcon as Receipt, FloppyDiskIcon as Save, TrashIcon as Trash2, TrendUpIcon as TrendingUp, WalletIcon as Wallet } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import Modal from '../../components/Modal'
import PeriodFilter from '../../components/PeriodFilter'
import TableScroller from '../../components/TableScroller'
import { confirmAction } from '../../components/ConfirmDialog'
import { formatDate } from '../../lib/utils'
import { periodLabel, periodToRange, type Period } from '../../lib/periodFilter'
import {
  createPlatformExpense,
  createPlatformWithdrawal,
  deletePlatformExpense,
  deletePlatformWithdrawal,
  getPlatformExpenses,
  getPlatformSummary,
  getPlatformWithdrawals,
  updatePlatformExpense,
  updatePlatformWithdrawal,
  type PlatformExpense,
  type PlatformFinanceSummary,
  type PlatformWithdrawal,
} from '../../services/platformFinance.services'

const EMPTY_SUMMARY: PlatformFinanceSummary = {
  subscription_monthly: 0,
  subscription_yearly: 0,
  subscription_income: 0,
  sms_income: 0,
  total_income: 0,
  total_expense: 0,
  expense_count: 0,
  profit: 0,
  total_withdrawn: 0,
  withdrawal_count: 0,
  available: 0,
  monthly: [],
}

// Common platform costs, offered as a datalist so the same bill is not typed
// three different ways and split across three rows in the totals.
const CATEGORY_SUGGESTIONS = ['Server', 'Domain', 'Email service', 'SMS gateway', 'Marketing', 'Salary', 'Software', 'Other']

// Tk 1,200 with a non-breaking space, so the amount never wraps away from
// its currency label in a narrow stat card.
const money = (value: number | string) => `Tk\u00A0${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)

type ExpenseForm = { date: string; category: string; amount: string; notes: string }
type WithdrawalForm = { date: string; taken_by: string; amount: string; notes: string }

const emptyExpenseForm = (): ExpenseForm => ({ date: today(), category: '', amount: '', notes: '' })
const emptyWithdrawalForm = (): WithdrawalForm => ({ date: today(), taken_by: '', amount: '', notes: '' })

export default function SuperAdminFinance() {
  const [period, setPeriod] = useState<Period>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [summary, setSummary] = useState<PlatformFinanceSummary>(EMPTY_SUMMARY)
  const [expenses, setExpenses] = useState<PlatformExpense[]>([])
  const [withdrawals, setWithdrawals] = useState<PlatformWithdrawal[]>([])
  const [loading, setLoading] = useState(true)

  const [expenseModal, setExpenseModal] = useState(false)
  const [expenseEditId, setExpenseEditId] = useState<string | null>(null)
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm)

  const [withdrawalModal, setWithdrawalModal] = useState(false)
  const [withdrawalEditId, setWithdrawalEditId] = useState<string | null>(null)
  const [withdrawalForm, setWithdrawalForm] = useState<WithdrawalForm>(emptyWithdrawalForm)

  const [saving, setSaving] = useState(false)

  // Custom range only counts once both ends are filled in, otherwise every
  // keystroke in the date input would fire a request for a half-typed range.
  const range = useMemo(() => {
    if (period === 'custom' && (!from || !to)) return {}
    return periodToRange(period, from, to)
  }, [period, from, to])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [nextSummary, nextExpenses, nextWithdrawals] = await Promise.all([
        getPlatformSummary(range),
        getPlatformExpenses(range),
        getPlatformWithdrawals(range),
      ])
      setSummary(nextSummary)
      setExpenses(nextExpenses)
      setWithdrawals(nextWithdrawals)
    } catch (error: any) {
      toast.error(error?.message || 'Could not load the finance data')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { loadAll() }, [loadAll])

  function openExpense(item?: PlatformExpense) {
    setExpenseEditId(item?.id ?? null)
    setExpenseForm(item
      ? { date: String(item.date).slice(0, 10), category: item.category, amount: String(item.amount), notes: item.notes }
      : emptyExpenseForm())
    setExpenseModal(true)
  }

  function openWithdrawal(item?: PlatformWithdrawal) {
    setWithdrawalEditId(item?.id ?? null)
    setWithdrawalForm(item
      ? { date: String(item.date).slice(0, 10), taken_by: item.taken_by, amount: String(item.amount), notes: item.notes }
      : emptyWithdrawalForm())
    setWithdrawalModal(true)
  }

  async function saveExpense(event: React.FormEvent) {
    event.preventDefault()
    const amount = Number(expenseForm.amount)
    if (!expenseForm.category.trim()) return toast.error('Category is required')
    if (!(amount > 0)) return toast.error('Amount must be more than zero')

    setSaving(true)
    try {
      const payload = { date: expenseForm.date, category: expenseForm.category.trim(), amount, notes: expenseForm.notes }
      if (expenseEditId) await updatePlatformExpense(expenseEditId, payload)
      else await createPlatformExpense(payload)
      toast.success(expenseEditId ? 'Expense updated' : 'Expense added')
      setExpenseModal(false)
      loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Could not save the expense')
    } finally {
      setSaving(false)
    }
  }

  async function saveWithdrawal(event: React.FormEvent) {
    event.preventDefault()
    const amount = Number(withdrawalForm.amount)
    if (!(amount > 0)) return toast.error('Amount must be more than zero')

    setSaving(true)
    try {
      const payload = { date: withdrawalForm.date, amount, taken_by: withdrawalForm.taken_by.trim(), notes: withdrawalForm.notes }
      if (withdrawalEditId) await updatePlatformWithdrawal(withdrawalEditId, payload)
      else await createPlatformWithdrawal(payload)
      toast.success(withdrawalEditId ? 'Withdrawal updated' : 'Withdrawal added')
      setWithdrawalModal(false)
      loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Could not save the withdrawal')
    } finally {
      setSaving(false)
    }
  }

  async function removeExpense(item: PlatformExpense) {
    if (!(await confirmAction({
      title: 'Delete Expense?',
      message: `Permanently delete the ${money(item.amount)} "${item.category}" expense? This cannot be undone and your profit will go up by that amount.`,
      confirmText: 'Yes, Delete',
      cancelText: 'No, Cancel',
    }))) return

    try {
      await deletePlatformExpense(item.id)
      toast.success('Expense deleted')
      loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete the expense')
    }
  }

  async function removeWithdrawal(item: PlatformWithdrawal) {
    if (!(await confirmAction({
      title: 'Delete Withdrawal?',
      message: `Permanently delete this ${money(item.amount)} withdrawal? This cannot be undone and your available balance will go up by that amount.`,
      confirmText: 'Yes, Delete',
      cancelText: 'No, Cancel',
    }))) return

    try {
      await deletePlatformWithdrawal(item.id)
      toast.success('Withdrawal deleted')
      loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete the withdrawal')
    }
  }

  const profitIsNegative = summary.profit < 0

  return (
    <div className="p-4 sm:p-6 print:p-0">
      <PageHeader
        title="Finance"
        subtitle="What this software earns, what it costs to run, and what is left"
        actions={
          <PeriodFilter
            period={period} setPeriod={setPeriod}
            from={from} setFrom={setFrom}
            to={to} setTo={setTo}
            onPrint={() => window.print()}
          />
        }
      />

      <p className="mb-4 text-sm text-slate-500">
        Showing <span className="font-medium text-slate-700">{periodLabel(period, from, to)}</span>
      </p>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total income"
          value={money(summary.total_income)}
          subtitle="Subscriptions + SMS sales"
          icon={<TrendingUp size={20} />}
          color="green"
        />
        <StatCard
          title="Subscription income"
          value={money(summary.subscription_income)}
          subtitle={`Monthly ${money(summary.subscription_monthly)} · Yearly ${money(summary.subscription_yearly)}`}
          icon={<Banknote size={20} />}
          color="blue"
        />
        <StatCard
          title="SMS income"
          value={money(summary.sms_income)}
          subtitle="Paid SMS packages"
          icon={<MessageSquareText size={20} />}
          color="blue"
        />
        <StatCard
          title="Expenses"
          value={money(summary.total_expense)}
          subtitle={`${summary.expense_count} entr${summary.expense_count === 1 ? 'y' : 'ies'}`}
          icon={<Receipt size={20} />}
          color="red"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Profit"
          value={money(summary.profit)}
          subtitle="Income minus expenses"
          icon={<TrendingUp size={20} />}
          color={profitIsNegative ? 'red' : 'green'}
        />
        <StatCard
          title="Withdrawn"
          value={money(summary.total_withdrawn)}
          subtitle={`${summary.withdrawal_count} withdrawal${summary.withdrawal_count === 1 ? '' : 's'}`}
          icon={<Wallet size={20} />}
          color="orange"
        />
        <StatCard
          title="Available"
          value={money(summary.available)}
          subtitle="Profit minus what you have taken out"
          icon={<Wallet size={20} />}
          color={summary.available < 0 ? 'red' : 'green'}
        />
      </div>

      <div className="card mb-6">
        <h2 className="mb-4 font-semibold text-slate-800">Income, expense and profit by month</h2>
        {loading ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">Loading chart...</div>
        ) : summary.monthly.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">Nothing to chart for this period yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={summary.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `${Number(v) / 1000}k`} />
              <Tooltip formatter={(value: number) => money(value)} />
              <Legend />
              <Bar dataKey="income" name="Income" fill="#1D9E75" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="#E11D48" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" name="Profit" fill="#0b0b0f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-800">Expenses</h2>
            <button type="button" onClick={() => openExpense()} className="btn-primary print:hidden">
              <Plus size={16} /> Add Expense
            </button>
          </div>
          <TableScroller>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Notes</th>
                  <th className="py-2 text-right print:hidden">Action</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">No expenses in this period</td></tr>
                ) : expenses.map(item => (
                  <tr key={item.id} className="border-b border-slate-50">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(item.date)}</td>
                    <td className="py-2 pr-3">{item.category || '-'}</td>
                    <td className="py-2 pr-3 text-right font-medium text-brand-red whitespace-nowrap">{money(item.amount)}</td>
                    <td className="py-2 pr-3 text-slate-500">{item.notes || '-'}</td>
                    <td className="py-2 text-right print:hidden">
                      <button onClick={() => openExpense(item)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => removeExpense(item)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-brand-red" title="Delete"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-800">Withdrawals</h2>
            <button type="button" onClick={() => openWithdrawal()} className="btn-primary print:hidden">
              <Plus size={16} /> Add Withdrawal
            </button>
          </div>
          <TableScroller>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Taken by</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Notes</th>
                  <th className="py-2 text-right print:hidden">Action</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">No withdrawals in this period</td></tr>
                ) : withdrawals.map(item => (
                  <tr key={item.id} className="border-b border-slate-50">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(item.date)}</td>
                    <td className="py-2 pr-3">{item.taken_by || '-'}</td>
                    <td className="py-2 pr-3 text-right font-medium whitespace-nowrap">{money(item.amount)}</td>
                    <td className="py-2 pr-3 text-slate-500">{item.notes || '-'}</td>
                    <td className="py-2 text-right print:hidden">
                      <button onClick={() => openWithdrawal(item)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => removeWithdrawal(item)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-brand-red" title="Delete"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroller>
        </div>
      </div>

      <Modal isOpen={expenseModal} onClose={() => setExpenseModal(false)} title={expenseEditId ? 'Edit Expense' : 'Add Expense'}>
        <form onSubmit={saveExpense} className="space-y-3">
          <div>
            <label className="label" htmlFor="super-admin-finance-f1">Date *</label>
            <input id="super-admin-finance-f1" type="date" className="input" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="super-admin-finance-f2">Category *</label>
            <input id="super-admin-finance-f2"
              className="input" list="platform-expense-categories" placeholder="Server, Domain, Marketing..."
              value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })} required
            />
            <datalist id="platform-expense-categories">
              {CATEGORY_SUGGESTIONS.map(name => <option key={name} value={name} />)}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="super-admin-finance-f3">Amount *</label>
            <input id="super-admin-finance-f3" type="number" min="0" step="0.01" className="input" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="super-admin-finance-f4">Notes</label>
            <textarea id="super-admin-finance-f4" className="input" rows={2} value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-60"><Save size={16} /> {saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setExpenseModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={withdrawalModal} onClose={() => setWithdrawalModal(false)} title={withdrawalEditId ? 'Edit Withdrawal' : 'Add Withdrawal'}>
        <form onSubmit={saveWithdrawal} className="space-y-3">
          <div>
            <label className="label" htmlFor="super-admin-finance-f5">Date *</label>
            <input id="super-admin-finance-f5" type="date" className="input" value={withdrawalForm.date} onChange={e => setWithdrawalForm({ ...withdrawalForm, date: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="super-admin-finance-f6">Taken by</label>
            <input id="super-admin-finance-f6" className="input" placeholder="Who took the money" value={withdrawalForm.taken_by} onChange={e => setWithdrawalForm({ ...withdrawalForm, taken_by: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="super-admin-finance-f7">Amount *</label>
            <input id="super-admin-finance-f7" type="number" min="0" step="0.01" className="input" value={withdrawalForm.amount} onChange={e => setWithdrawalForm({ ...withdrawalForm, amount: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="super-admin-finance-f8">Notes</label>
            <textarea id="super-admin-finance-f8" className="input" rows={2} value={withdrawalForm.notes} onChange={e => setWithdrawalForm({ ...withdrawalForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-60"><Save size={16} /> {saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setWithdrawalModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
