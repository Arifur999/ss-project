import React, { useState, useEffect, useMemo } from 'react'
import { PlusIcon as Plus, FloppyDiskIcon as Save, PencilSimpleIcon as Pencil, TrashIcon as Trash2, CalendarDotsIcon as CalendarDays, ClipboardTextIcon as ClipboardList, TargetIcon as Target, WalletIcon as WalletCards } from '@phosphor-icons/react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'
import { confirmAction } from '../../components/ConfirmDialog'
import { KpiCard } from '../../components/ReportCards'

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
  const totalYearExpense = Object.values(thisYearTotals).reduce((s, v) => s + v, 0)
  const totalExpenses = Object.values(allTimeTotals).reduce((s, v) => s + v, 0)
  const totalBudget = categories.reduce((s, c) => s + Number(c.monthly_budget || 0), 0)
  // Budgets are stored per month, so the yearly allowance is twelve of them.
  const totalYearBudget = totalBudget * 12
  const budgetUsage = totalBudget > 0 ? (totalMonthExpense / totalBudget) * 100 : 0
  const yearBudgetUsage = totalYearBudget > 0 ? (totalYearExpense / totalYearBudget) * 100 : 0
  const sortedCategories = [...categories].sort((a, b) => {
    const totalDiff = (allTimeTotals[b.id] || 0) - (allTimeTotals[a.id] || 0)
    return totalDiff || String(a.name || '').localeCompare(String(b.name || ''))
  })
  const summaryCards = [
    {
      label: 'Total Expenses',
      value: formatCurr(totalExpenses),
      icon: <ClipboardList size={17} weight="duotone" />,
      note: `Across ${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`,
      tone: 'text-navy-900',
    },
    {
      label: t('expenses_monthlyBudget'),
      value: formatCurr(totalBudget),
      icon: <WalletCards size={17} weight="duotone" />,
      note: "This month's allowance",
      tone: 'text-brand-green',
    },
    {
      label: t('expenses_thisMonthTotal'),
      value: formatCurr(totalMonthExpense),
      icon: <CalendarDays size={17} weight="duotone" />,
      note: totalBudget > 0 ? `${Math.round(budgetUsage)}% of the monthly budget` : 'No monthly budget set',
      progress: totalBudget > 0 ? budgetUsage : undefined,
      tone: 'text-brand-red',
    },
    {
      label: 'Yearly Budget',
      value: formatCurr(totalYearBudget),
      icon: <WalletCards size={17} weight="duotone" />,
      note: 'Twelve monthly budgets',
      tone: 'text-brand-green',
    },
    {
      label: t('expenses_thisYearTotal'),
      value: formatCurr(totalYearExpense),
      icon: <CalendarDays size={17} weight="duotone" />,
      note: totalYearBudget > 0 ? `${Math.round(yearBudgetUsage)}% of the yearly budget` : 'No yearly budget set',
      progress: totalYearBudget > 0 ? yearBudgetUsage : undefined,
      tone: 'text-brand-blue',
    },
    {
      label: t('expenses_budgetUsage'),
      value: `${Math.round(budgetUsage)}% / ${Math.round(yearBudgetUsage)}%`,
      icon: <Target size={17} weight="duotone" />,
      note: 'Month / year',
      tone: budgetUsage > 100 || yearBudgetUsage > 100 ? 'text-brand-red' : 'text-brand-green',
    },
  ]

  /**
   * Every category's share of what has been spent, largest first.
   *
   * Built from `categories`, so a category created today is in the chart the
   * moment its first expense lands - there is no separate list to keep in
   * step. Categories with nothing spent are left out: a 0% slice cannot be
   * drawn, and they are all still listed in the boxes below.
   */
  const expenseShare = useMemo(() => {
    const rows = categories
      .map(category => ({
        id: category.id,
        name: category.name,
        color: category.color,
        value: allTimeTotals[category.id] || 0,
      }))
      .filter(row => row.value > 0)
      .sort((a, b) => b.value - a.value)
    const total = rows.reduce((sum, row) => sum + row.value, 0)
    return {
      total,
      rows: rows.map(row => ({ ...row, share: total > 0 ? (row.value / total) * 100 : 0 })),
    }
  }, [categories, allTimeTotals])

  /**
   * The percentage on the slice itself. Anything under 5% is left off - the
   * labels start colliding below that, and every category is spelled out with
   * its own percentage in the list beside the ring anyway.
   */
  function ShareLabel({ cx, cy, midAngle, outerRadius, percent }: any) {
    if (percent * 100 < 5) return null
    const radian = Math.PI / 180
    const distance = outerRadius + 16
    const x = cx + distance * Math.cos(-midAngle * radian)
    const y = cy + distance * Math.sin(-midAngle * radian)
    return (
      <text
        x={x}
        y={y}
        fill="#374151"
        fontSize={11}
        fontWeight={700}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
      >
        {Math.round(percent * 100)}%
      </text>
    )
  }

  // The taka figure, which the chart deliberately does not show until asked.
  function ShareTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload
    if (!row) return null
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="text-xs font-bold text-slate-900">{row.name}</span>
        </div>
        <p className="mt-1 text-sm font-black tabular-nums text-slate-900">{formatCurr(row.value)}</p>
        <p className="text-[11px] text-slate-500">{row.share.toFixed(1)}% of all expenses</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title={t('expenses_dashTitle')}
        subtitle={t('expenses_dashSubtitle')}
        actions={<button onClick={() => openModal()} className="btn-primary"><Plus size={16} /> {t('expenses_newCategory')}</button>}
      />

      {/* The same card the reports and the dashboard use, so its padding and
          spacing come from one place rather than being set again here. */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map(card => (
          <KpiCard
            key={card.label}
            label={card.label}
            icon={card.icon}
            value={card.value}
            note={card.note}
            progress={card.progress}
            valueClassName={card.tone}
          />
        ))}
      </div>

      {/* Where the money went, as one ring: the percentage on the chart, the
          taka on hover. */}
      <section className="mb-5 overflow-hidden rounded-2xl border border-surface-border bg-surface">
        <div className="bg-slate-800 px-4 py-3 text-center">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Expenses By Category</h2>
        </div>

        {expenseShare.rows.length === 0 ? (
          <p className="px-4 py-16 text-center text-xs font-medium text-slate-400">
            Nothing spent yet. Every category you create appears here as soon as it has an expense against it.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-6 p-5 lg:flex-row lg:items-center">
            <div className="relative w-full max-w-[380px] shrink-0 lg:w-[380px]">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={expenseShare.rows}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={100}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={expenseShare.rows.length > 1 ? 2 : 0}
                    stroke="none"
                    labelLine={false}
                    label={ShareLabel}
                    isAnimationActive={false}
                  >
                    {expenseShare.rows.map(row => <Cell key={row.id} fill={row.color} />)}
                  </Pie>
                  <Tooltip content={<ShareTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* What the percentages are percentages of. */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-black leading-none tracking-tight tabular-nums text-navy-900">{formatCurr(expenseShare.total)}</p>
                <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Total Expenses</p>
              </div>
            </div>

            {/* Every category by name, including the slices too thin to label. */}
            <div className="min-w-0 flex-1 divide-y divide-slate-200">
              {expenseShare.rows.map(row => (
                <div key={row.id} className="flex items-center gap-3 py-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700" title={row.name}>{row.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">{formatCurr(row.value)}</span>
                  <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-navy-900">{row.share.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {sortedCategories.map(cat => {
          const totalSpent = allTimeTotals[cat.id] || 0
          const monthSpent = thisMonthTotals[cat.id] || 0
          const yearSpent = thisYearTotals[cat.id] || 0
          const budget = Number(cat.monthly_budget || 0)
          // rawPct is the true usage (can exceed 100%); pct is only used to cap
          // the progress-bar width so the bar never overflows its track.
          const rawPct = budget > 0 ? (monthSpent / budget) * 100 : 0
          const pct = Math.min(100, rawPct)
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
                  <>
                    <div className="flex justify-between text-xs">
                      {/* Spelled out as monthly: the bar below measures only this
                          month's spend against it. */}
                      <span className="text-slate-500">{t('expenses_monthlyBudget')}</span>
                      <span className="font-medium text-slate-600">{formatCurr(budget)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Yearly Budget</span>
                      <span className="font-medium text-slate-600">{formatCurr(budget * 12)}</span>
                    </div>
                  </>
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
                    {/* The locale string already carries the "%", so don't add another. */}
                    <span className={`text-xs ${rawPct > 100 ? 'font-semibold text-brand-red' : 'text-slate-400'}`}>{Math.round(rawPct)}{t('expenses_pctUsed')}</span>
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
          <div><label className="label" htmlFor="expense-dashboard-f1">{t('expenses_categoryName')}</label><input id="expense-dashboard-f1" className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <label className="label">{t('expenses_color')}</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })} className="w-7 h-7 rounded-full border-2 transition-all" style={{ backgroundColor: c, borderColor: form.color === c ? '#1D3557' : 'transparent' }} />
              ))}
            </div>
          </div>
          <div><label className="label" htmlFor="expense-dashboard-f2">{t('expenses_monthlyBudgetField')}</label><input id="expense-dashboard-f2" type="number" min="0" className="input" value={form.monthly_budget || ''} onChange={e => setForm({ ...form, monthly_budget: Number(e.target.value) })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {t('common_save')}</button>
            <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
