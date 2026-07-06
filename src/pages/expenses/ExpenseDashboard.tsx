import React, { useState, useEffect } from 'react'
import { Plus, Save, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'
import { confirmAction } from '../../components/ConfirmDialog'

const PRESET_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f97316', '#06b6d4']
const LINKED_EXPENSE_CATEGORY_DELETE_MESSAGE = 'Cannot Delete Category: This expense category contains existing transaction history. You must delete all linked transactions first before removing the category!'

export default function ExpenseDashboard() {
  const { t, formatCurr } = useLang()
  const [categories, setCategories] = useState<any[]>([])
  const [allTimeTotals, setAllTimeTotals] = useState<Record<string, number>>({})
  const [thisMonthTotals, setThisMonthTotals] = useState<Record<string, number>>({})
  const [thisYearTotals, setThisYearTotals] = useState<Record<string, number>>({})
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [form, setForm] = useState({ name: '', color: PRESET_COLORS[0], monthly_budget: 0 })

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('expense-dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_categories' }, () => loadAll())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function loadAll() {
    const [catRes, expRes] = await Promise.all([
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('expenses').select('amount, category_id, date'),
    ])
    setCategories(catRes.data || [])
    const expenses = expRes.data || []
    const totals: Record<string, number> = {}
    const monthTotals: Record<string, number> = {}
    const yearTotals: Record<string, number> = {}
    expenses.forEach((e: any) => {
      const d = new Date(e.date)
      totals[e.category_id] = (totals[e.category_id] || 0) + Number(e.amount)
      if (d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear) {
        monthTotals[e.category_id] = (monthTotals[e.category_id] || 0) + Number(e.amount)
      }
      if (d.getFullYear() === currentYear) {
        yearTotals[e.category_id] = (yearTotals[e.category_id] || 0) + Number(e.amount)
      }
    })
    setAllTimeTotals(totals)
    setThisMonthTotals(monthTotals)
    setThisYearTotals(yearTotals)
  }

  function openModal(item?: any) {
    setEditItem(item || null)
    setForm(item ? { name: item.name, color: item.color, monthly_budget: item.monthly_budget } : { name: '', color: PRESET_COLORS[0], monthly_budget: 0 })
    setShowModal(true)
  }

  async function save() {
    if (!form.name) return toast.error(t('expenses_categoryName'))
    if (editItem) { await supabase.from('expense_categories').update(form).eq('id', editItem.id) }
    else { await supabase.from('expense_categories').insert(form) }
    toast.success(t('common_saved'))
    setShowModal(false)
    loadAll()
  }

  async function deleteCategory(id: string) {
    if (!(await confirmAction({
      title: 'Delete Expense Category?',
      message: 'Are you sure you want to permanently delete this expense category? This will wipe the category record if no transactional footprints are attached.',
      confirmText: 'Yes, Delete',
      cancelText: 'No, Cancel',
    }))) return

    const { count, error: countError } = await supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)

    if (countError) return toast.error(countError.message || 'Failed to validate category history')
    if (Number(count || 0) > 0) {
      toast.error(LINKED_EXPENSE_CATEGORY_DELETE_MESSAGE)
      return
    }

    const category = categories.find(cat => cat.id === id)
    if (category) {
      addRecycleItem({
        type: 'expenses',
        table: 'expense_categories',
        title: category.name || '-',
        subtitle: 'Category',
        amount: Number(category.monthly_budget || 0),
        data: category,
      })
    }
    const { error } = await supabase.from('expense_categories').delete().eq('id', id)
    if (error) {
      const message = String(error.message || '')
      if (message.includes('existing transaction history') || message.includes('foreign key')) {
        toast.error(LINKED_EXPENSE_CATEGORY_DELETE_MESSAGE)
        return
      }
      toast.error(error.message)
      return
    }
    toast.success('Expense category deleted successfully.')
    loadAll()
  }

  const totalMonthExpense = Object.values(thisMonthTotals).reduce((s, v) => s + v, 0)
  const totalExpenses = Object.values(allTimeTotals).reduce((s, v) => s + v, 0)
  const totalBudget = categories.reduce((s, c) => s + Number(c.monthly_budget || 0), 0)
  const budgetUsage = totalBudget > 0 ? (totalMonthExpense / totalBudget) * 100 : 0
  const sortedCategories = [...categories].sort((a, b) => {
    const totalDiff = (allTimeTotals[b.id] || 0) - (allTimeTotals[a.id] || 0)
    return totalDiff || String(a.name || '').localeCompare(String(b.name || ''))
  })
  const summaryCards = [
    { label: 'Total Expenses', value: formatCurr(totalExpenses), tone: 'text-white' },
    { label: t('expenses_monthlyBudget'), value: formatCurr(totalBudget), tone: 'text-emerald-200' },
    { label: t('expenses_thisMonthTotal'), value: formatCurr(totalMonthExpense), tone: 'text-rose-200' },
    { label: t('expenses_budgetUsage'), value: `${Math.round(budgetUsage)}% Used`, tone: budgetUsage > 100 ? 'text-rose-200' : 'text-emerald-200' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <PageHeader
        title={t('expenses_dashTitle')}
        subtitle={t('expenses_dashSubtitle')}
        actions={<button onClick={() => openModal()} className="btn-primary"><Plus size={16} /> {t('expenses_newCategory')}</button>}
      />

      <div className="mb-6 grid flex-shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(card => (
          <div key={card.label} className="rounded-lg bg-[#1D3557] p-5 shadow-sm border border-[#27486f]">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-300">{card.label}</p>
            <p className={`text-2xl font-bold mt-2 ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 pb-1 lg:grid-cols-2 2xl:grid-cols-3">
        {sortedCategories.map(cat => {
          const totalSpent = allTimeTotals[cat.id] || 0
          const monthSpent = thisMonthTotals[cat.id] || 0
          const yearSpent = thisYearTotals[cat.id] || 0
          const budget = Number(cat.monthly_budget || 0)
          const pct = budget > 0 ? Math.min(100, (monthSpent / budget) * 100) : 0
          const status = budget === 0 ? null : monthSpent > budget ? 'over' : monthSpent > budget * 0.8 ? 'warning' : 'ok'

          return (
            <div key={cat.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <h3 className="font-semibold text-slate-800">{cat.name}</h3>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openModal(cat)} className="text-slate-400 hover:text-slate-600 p-1"><Pencil size={13} /></button>
                  <button onClick={() => deleteCategory(cat.id)} className="text-slate-400 hover:text-brand-red p-1"><Trash2 size={13} /></button>
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total</span>
                  <span className="font-semibold text-slate-900">{formatCurr(totalSpent)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">{t('expenses_thisMonth')}</span>
                  <span className="font-semibold text-slate-800">{formatCurr(monthSpent)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">{t('expenses_thisYear')}</span>
                  <span className="font-medium text-slate-600">{formatCurr(yearSpent)}</span>
                </div>
                {budget > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">{t('expenses_budget')}</span>
                    <span className="font-medium text-slate-600">{formatCurr(budget)}</span>
                  </div>
                )}
              </div>

              {budget > 0 && (
                <>
                  <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: status === 'over' ? '#E24B4A' : status === 'warning' ? '#f59e0b' : cat.color }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">{Math.round(pct)}% {t('expenses_pctUsed')}</span>
                    {status && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${status === 'over' ? 'badge-red' : status === 'warning' ? 'badge-orange' : 'badge-green'}`}>
                        {status === 'over' ? t('expenses_overBudget') : status === 'warning' ? t('expenses_warning') : t('expenses_ok')}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? t('expenses_editCategory') : t('expenses_newCategoryTitle')}>
        <div className="space-y-3">
          <div><label className="label">{t('expenses_categoryName')}</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <label className="label">{t('expenses_color')}</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })} className="w-7 h-7 rounded-full border-2 transition-all" style={{ backgroundColor: c, borderColor: form.color === c ? '#1D3557' : 'transparent' }} />
              ))}
            </div>
          </div>
          <div><label className="label">{t('expenses_monthlyBudgetField')}</label><input type="number" min="0" className="input" value={form.monthly_budget || ''} onChange={e => setForm({ ...form, monthly_budget: Number(e.target.value) })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {t('common_save')}</button>
            <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
