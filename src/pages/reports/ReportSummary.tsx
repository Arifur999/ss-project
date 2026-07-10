import React, { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileBarChart,
  Package,
  RefreshCw,
  Target,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { readOtherIncomeFallbackRows } from '../../lib/otherIncomeFallback'
import { supabase } from '../../lib/supabase'
import { isMissingTableError } from '../../lib/supabaseErrors'
import toast from 'react-hot-toast'

type BreakdownRow = {
  name: string
  type?: string
  qty?: number
  count?: number
  amount: number
  cost?: number
  profit?: number
  incentive?: number
  actualPurchase?: number
  paid?: number
  due?: number
  percent?: number
}

type ReportData = {
  salesTarget: number
  profitTarget: number
  totalSales: number
  salesCost: number
  grossProfit: number
  purchaseValue: number
  purchaseIncentive: number
  purchaseDeposit: number
  purchaseQty: number
  totalExpenses: number
  totalOtherIncome: number
  supplierPayments: number
  profitWithdraw: number
  profitLoss: number
  availableProfit: number
  salesBreakdown: BreakdownRow[]
  purchaseBreakdown: BreakdownRow[]
  expenseBreakdown: BreakdownRow[]
  supplierPaymentBreakdown: BreakdownRow[]
  otherIncomeBreakdown: BreakdownRow[]
}

type MonthlyTargetOption = {
  month: number
  year: number
  sales_target: number
  profit_target: number
}

type FilterMode = 'monthly' | 'custom'

const emptyReport: ReportData = {
  salesTarget: 0,
  profitTarget: 0,
  totalSales: 0,
  salesCost: 0,
  grossProfit: 0,
  purchaseValue: 0,
  purchaseIncentive: 0,
  purchaseDeposit: 0,
  purchaseQty: 0,
  totalExpenses: 0,
  totalOtherIncome: 0,
  supplierPayments: 0,
  profitWithdraw: 0,
  profitLoss: 0,
  availableProfit: 0,
  salesBreakdown: [],
  purchaseBreakdown: [],
  expenseBreakdown: [],
  supplierPaymentBreakdown: [],
  otherIncomeBreakdown: [],
}

function isoDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function monthRange(year: number, month: number) {
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: isoDate(new Date(year, month, 0)),
  }
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd
}

function pct(value: number, target: number) {
  return target > 0 ? (value / target) * 100 : 0
}

function amount(value: any) {
  return Number(value || 0)
}

function percentText(value: number) {
  return `${value.toFixed(1)}%`
}

function breakdownText(value: number) {
  return `${value.toFixed(2)}%`
}

function withDateRange(query: any, start: string | null, end: string | null) {
  if (!start || !end) return query
  return query.gte('date', start).lte('date', end)
}

export default function ReportSummary() {
  const { user } = useAuth()
  const { formatCurr, formatNum, formatDateShort, monthName } = useLang()
  const currentDate = useMemo(() => new Date(), [])
  const initialMonthRange = useMemo(() => monthRange(currentDate.getFullYear(), currentDate.getMonth() + 1), [currentDate])
  const [filterMode, setFilterMode] = useState<FilterMode>('monthly')
  const [targetOptions, setTargetOptions] = useState<MonthlyTargetOption[]>([])
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [customStart, setCustomStart] = useState(initialMonthRange.start)
  const [customEnd, setCustomEnd] = useState(initialMonthRange.end)
  const [data, setData] = useState<ReportData>(emptyReport)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const range = useMemo(() => {
    if (filterMode === 'custom') {
      const customStartValue = customStart || initialMonthRange.start
      const customEndValue = customEnd || initialMonthRange.end
      const start = customStartValue <= customEndValue ? customStartValue : customEndValue
      const end = customStartValue <= customEndValue ? customEndValue : customStartValue
      return { start, end, label: 'Custom' }
    }
    return { ...monthRange(selectedYear, selectedMonth), label: `${monthName(selectedMonth)} ${selectedYear}` }
  }, [filterMode, customStart, customEnd, initialMonthRange.start, initialMonthRange.end, selectedMonth, selectedYear, monthName])

  const yearOptions = useMemo(() => {
    return Array.from(new Set(targetOptions.map(option => option.year))).sort((a, b) => b - a)
  }, [targetOptions])

  const monthOptions = useMemo(() => {
    const monthsForYear = targetOptions.filter(option => option.year === selectedYear).map(option => option.month)
    const source = monthsForYear.length ? monthsForYear : targetOptions.map(option => option.month)
    return Array.from(new Set(source)).sort((a, b) => a - b)
  }, [targetOptions, selectedYear])

  useEffect(() => {
    loadTargetOptions()
  }, [])

  useEffect(() => {
    loadReport()
  }, [filterMode, range.start, range.end])

  async function loadTargetOptions() {
    try {
      const { data: rows, error } = await supabase
        .from('monthly_targets')
        .select('month, year, sales_target, profit_target')
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (error) throw error

      const options = (rows || [])
        .map((row: any) => ({
          month: Number(row.month || 0),
          year: Number(row.year || 0),
          sales_target: amount(row.sales_target),
          profit_target: amount(row.profit_target),
        }))
        .filter(option => option.month >= 1 && option.month <= 12 && option.year > 0)

      setTargetOptions(options)

      if (options.length > 0) {
        const currentMonth = currentDate.getMonth() + 1
        const currentYear = currentDate.getFullYear()
        const currentOption = options.find(option => option.month === currentMonth && option.year === currentYear)
        const fallbackOption = currentOption || options[0]
        setSelectedMonth(fallbackOption.month)
        setSelectedYear(fallbackOption.year)
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load monthly target filters')
    }
  }

  function handleYearChange(year: number) {
    setSelectedYear(year)
    const monthsForYear = targetOptions.filter(option => option.year === year).map(option => option.month)
    if (monthsForYear.length > 0 && !monthsForYear.includes(selectedMonth)) {
      setSelectedMonth(monthsForYear.sort((a, b) => a - b)[0])
    }
  }

  async function loadReport() {
    try {
      setLoading(true)
      const targetQuery = filterMode === 'monthly'
        ? supabase
          .from('monthly_targets')
          .select('month, year, sales_target, profit_target')
          .eq('year', selectedYear)
          .eq('month', selectedMonth)
        : supabase
          .from('monthly_targets')
          .select('month, year, sales_target, profit_target')
          .gte('year', Number(range.start.slice(0, 4)))
          .lte('year', Number(range.end.slice(0, 4)))

      const [salesRes, purchasesRes, expensesRes, supplierPaymentsRes, targetsRes, withdrawRes, otherIncomeRes] = await Promise.all([
        withDateRange(
          supabase
            .from('sales')
            .select('id, date, subtotal, discount_amount, net_amount, paid_amount, due_amount, sale_items(*)')
            .eq('status', 'completed'),
          range.start,
          range.end
        ),
        withDateRange(
          supabase
            .from('purchases')
            .select('id, date, supplier_id, supplier_name, total_amount, net_amount, purchase_items(*)'),
          range.start,
          range.end
        ),
        withDateRange(
          supabase
            .from('expenses')
            .select('date, amount, category_id, category_name'),
          range.start,
          range.end
        ),
        withDateRange(
          supabase
            .from('supplier_payments')
            .select('date, supplier_id, supplier_name, amount'),
          range.start,
          range.end
        ),
        targetQuery,
        withDateRange(
          supabase
            .from('profit_withdrawals')
            .select('date, profit_month, profit_year, amount'),
          range.start,
          range.end
        ),
        withDateRange(
          supabase
            .from('other_incomes')
            .select('date, amount, income_type, supplier_name, source_name'),
          range.start,
          range.end
        ),
      ])

      if (salesRes.error) throw salesRes.error
      if (purchasesRes.error) throw purchasesRes.error
      if (expensesRes.error) throw expensesRes.error
      if (supplierPaymentsRes.error) throw supplierPaymentsRes.error
      if (targetsRes.error) throw targetsRes.error
      if (withdrawRes.error) throw withdrawRes.error
      if (otherIncomeRes.error && !isMissingTableError(otherIncomeRes.error, 'other_incomes')) throw otherIncomeRes.error

      const sales = salesRes.data || []
      const purchases = purchasesRes.data || []
      const expenses = expensesRes.data || []
      const supplierPayments = supplierPaymentsRes.data || []
      const targets = targetsRes.data || []
      const withdrawals = withdrawRes.data || []
      const otherIncomes = otherIncomeRes.error
        ? readOtherIncomeFallbackRows(user?.id).filter(row => row.date >= range.start && row.date <= range.end)
        : otherIncomeRes.data || []

      const activeTargets = filterMode === 'monthly'
        ? targets
        : targets.filter((target: any) => {
          const targetYear = Number(target.year || 0)
          const targetMonth = Number(target.month || 0)
          if (!targetYear || !targetMonth) return false
          const targetRange = monthRange(targetYear, targetMonth)
          return overlaps(targetRange.start, targetRange.end, range.start, range.end)
        })
      const salesTarget = activeTargets.reduce((sum: number, target: any) => sum + amount(target.sales_target), 0)
      const profitTarget = activeTargets.reduce((sum: number, target: any) => sum + amount(target.profit_target), 0)

      const totalSales = sales.reduce((sum: number, sale: any) => sum + amount(sale.net_amount || sale.subtotal), 0)
      const saleProductMap: Record<string, BreakdownRow> = {}
      sales.forEach((sale: any) => {
        (sale.sale_items || []).forEach((item: any) => {
          const name = item.product_name || 'Unknown Product'
          const qty = amount(item.qty)
          const saleAmount = amount(item.total_amount) || amount(item.actual_price) * qty || amount(item.selling_price) * qty
          const unitCost = amount(item.cost_price)
          const cost = unitCost > 0 ? unitCost * qty : 0
          const profit = saleAmount - cost
          const current = saleProductMap[name] || { name, qty: 0, amount: 0, cost: 0, profit: 0 }
          current.qty = amount(current.qty) + qty
          current.amount += saleAmount
          current.cost = amount(current.cost) + cost
          current.profit = amount(current.profit) + profit
          saleProductMap[name] = current
        })
      })
      const salesCost = Object.values(saleProductMap).reduce((sum, row) => sum + amount(row.cost), 0)
      const grossProfit = Object.values(saleProductMap).reduce((sum, row) => sum + amount(row.profit), 0)
      const salesBreakdown = Object.values(saleProductMap)
        .map(row => ({ ...row, percent: pct(row.amount, totalSales) }))
        .sort((a, b) => amount(b.profit) - amount(a.profit))

      const purchaseProductMap: Record<string, BreakdownRow> = {}
      purchases.forEach((purchase: any) => {
        (purchase.purchase_items || []).forEach((item: any) => {
          const name = item.product_name || 'Unknown Product'
          const qty = amount(item.qty)
          const rowAmount = amount(item.total_amount)
          const incentive = amount(item.sp_amount)
          const current = purchaseProductMap[name] || { name, qty: 0, amount: 0, incentive: 0, actualPurchase: 0 }
          current.qty = amount(current.qty) + qty
          current.amount += rowAmount
          current.incentive = amount(current.incentive) + incentive
          current.actualPurchase = amount(current.actualPurchase) + Math.max(0, rowAmount - incentive)
          purchaseProductMap[name] = current
        })
      })
      const purchaseValue = purchases.reduce((sum: number, purchase: any) => sum + amount(purchase.net_amount || purchase.total_amount), 0)
        || Object.values(purchaseProductMap).reduce((sum, row) => sum + row.amount, 0)
      const purchaseIncentive = Object.values(purchaseProductMap).reduce((sum, row) => sum + amount(row.incentive), 0)
      const purchaseDeposit = Math.max(0, purchaseValue - purchaseIncentive)
      const purchaseQty = Object.values(purchaseProductMap).reduce((sum, row) => sum + amount(row.qty), 0)
      const purchaseBreakdown = Object.values(purchaseProductMap)
        .map(row => ({ ...row, percent: pct(row.amount, purchaseValue) }))
        .sort((a, b) => b.amount - a.amount)

      const totalExpenses = expenses.reduce((sum: number, expense: any) => sum + amount(expense.amount), 0)
      const expenseMap: Record<string, BreakdownRow> = {}
      expenses.forEach((expense: any) => {
        const name = expense.category_name || 'Uncategorized'
        const current = expenseMap[name] || { name, amount: 0, count: 0 }
        current.amount += amount(expense.amount)
        current.count = amount(current.count) + 1
        expenseMap[name] = current
      })
      const expenseBreakdown = Object.values(expenseMap)
        .map(row => ({ ...row, percent: pct(row.amount, totalExpenses) }))
        .sort((a, b) => b.amount - a.amount)

      const supplierPaymentMap: Record<string, BreakdownRow> = {}
      purchases.forEach((purchase: any) => {
        const key = purchase.supplier_id || purchase.supplier_name || 'Unknown Supplier'
        const name = purchase.supplier_name || 'Unknown Supplier'
        const purchaseAmount = amount(purchase.net_amount || purchase.total_amount)
        const qty = (purchase.purchase_items || []).reduce((sum: number, item: any) => sum + amount(item.qty), 0)
        const current = supplierPaymentMap[key] || { name, qty: 0, amount: 0, paid: 0, due: 0 }
        current.qty = amount(current.qty) + qty
        current.amount += purchaseAmount
        supplierPaymentMap[key] = current
      })
      supplierPayments.forEach((payment: any) => {
        const key = payment.supplier_id || payment.supplier_name || 'Unknown Supplier'
        const name = payment.supplier_name || supplierPaymentMap[key]?.name || 'Unknown Supplier'
        const current = supplierPaymentMap[key] || { name, qty: 0, amount: 0, paid: 0, due: 0 }
        current.paid = amount(current.paid) + amount(payment.amount)
        supplierPaymentMap[key] = current
      })
      const supplierPaymentsTotal = supplierPayments.reduce((sum: number, payment: any) => sum + amount(payment.amount), 0)
      const supplierPaymentBreakdown = Object.values(supplierPaymentMap)
        .map(row => ({ ...row, due: amount(row.amount) - amount(row.paid), percent: pct(row.amount, purchaseValue) }))
        .sort((a, b) => b.amount - a.amount)

      const totalOtherIncome = otherIncomes.reduce((sum: number, income: any) => sum + amount(income.amount), 0)
      const otherIncomeMap: Record<string, BreakdownRow> = {}
      otherIncomes.forEach((income: any) => {
        const type = income.income_type === 'supplier' ? 'Supplier' : 'Other'
        const name = income.income_type === 'supplier'
          ? income.supplier_name || 'Unknown Supplier'
          : income.source_name || 'Other Source'
        const key = `${type}-${name}`
        const current = otherIncomeMap[key] || { name, type, amount: 0, count: 0 }
        current.amount += amount(income.amount)
        current.count = amount(current.count) + 1
        otherIncomeMap[key] = current
      })
      const otherIncomeBreakdown = Object.values(otherIncomeMap)
        .map(row => ({ ...row, percent: pct(row.amount, totalOtherIncome) }))
        .sort((a, b) => b.amount - a.amount)

      const profitWithdraw = withdrawals.reduce((sum: number, withdrawal: any) => sum + amount(withdrawal.amount), 0)
      const profitLoss = grossProfit + purchaseIncentive + totalOtherIncome - totalExpenses

      setData({
        salesTarget,
        profitTarget,
        totalSales,
        salesCost,
        grossProfit,
        purchaseValue,
        purchaseIncentive,
        purchaseDeposit,
        purchaseQty,
        totalExpenses,
        totalOtherIncome,
        supplierPayments: supplierPaymentsTotal,
        profitWithdraw,
        profitLoss,
        availableProfit: profitLoss - profitWithdraw,
        salesBreakdown,
        purchaseBreakdown,
        expenseBreakdown,
        supplierPaymentBreakdown,
        otherIncomeBreakdown,
      })
      setLastUpdated(new Date())
    } catch (err: any) {
      toast.error(err.message || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const salesAchievedPct = pct(data.totalSales, data.salesTarget)
  const achievedProfit = data.grossProfit + data.purchaseIncentive + data.totalOtherIncome
  const profitAchievedPct = pct(achievedProfit, data.profitTarget)
  const profitMargin = data.totalSales > 0 ? (data.profitLoss / data.totalSales) * 100 : 0

  function ProgressCard({
    title,
    value,
    target,
    progress,
    tone,
  }: {
    title: string
    value: number
    target: number
    progress: number
    tone: 'blue' | 'green'
  }) {
    const bar = tone === 'blue' ? 'bg-blue-600' : 'bg-brand-green'

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurr(value)}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {percentText(progress)} of {formatCurr(target)}
          </p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      </div>
    )
  }

  function MetricCard({
    title,
    value,
    subtitle,
  }: {
    title: string
    value: string
    subtitle?: string
  }) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 text-xl font-bold leading-tight text-slate-900 tabular-nums">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
    )
  }

  function OverviewLine({ icon, label, value, tone = 'slate' }: { icon: React.ReactNode; label: string; value: string; tone?: 'green' | 'red' | 'blue' | 'slate' }) {
    const toneClass = {
      green: 'text-brand-green',
      red: 'text-brand-red',
      blue: 'text-blue-600',
      slate: 'text-slate-700',
    }[tone]

    return (
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-600">
          <span className={`flex-shrink-0 ${toneClass}`}>{icon}</span>
          <span className="truncate">{label}</span>
        </div>
        <span className={`text-right text-xs font-bold tabular-nums ${toneClass}`}>{value}</span>
      </div>
    )
  }

  type TableColumn = {
    label: string
    align?: 'left' | 'right'
    render: (row: BreakdownRow) => React.ReactNode
  }

  function ReportBreakdownTable({
    title,
    rows,
    totalRow,
    columns,
    minWidth = '720px',
  }: {
    title: string
    rows: BreakdownRow[]
    totalRow: BreakdownRow
    columns: TableColumn[]
    minWidth?: string
  }) {
    return (
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-800 px-4 py-3 text-center">
          <h2 className="text-sm font-black uppercase tracking-[0.28em] text-white">{title}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth }}>
            <thead className="bg-white text-slate-600">
              <tr className="border-b border-slate-100">
                {columns.map(column => (
                  <th key={column.label} className={`px-3 py-2 font-bold ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50 font-black text-slate-900">
                {columns.map(column => (
                  <td
                    key={column.label}
                    className={`px-3 py-2 ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                  >
                    {column.render(totalRow)}
                  </td>
                ))}
              </tr>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-sm text-slate-400" colSpan={columns.length}>No data</td>
                </tr>
              ) : rows.map((row, rowIndex) => (
                <tr key={`${row.name}-${rowIndex}`} className="hover:bg-slate-50">
                  {columns.map(column => (
                    <td key={column.label} className={`px-3 py-2 ${column.align === 'right' ? 'text-right font-medium tabular-nums text-slate-800' : 'font-medium text-slate-800'}`}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  function clippedName(row: BreakdownRow) {
    return <span className="block max-w-[360px] truncate" title={row.name}>{row.name}</span>
  }

  const salesTotalRow: BreakdownRow = {
    name: 'Total Items',
    qty: data.salesBreakdown.reduce((sum, row) => sum + amount(row.qty), 0),
    amount: data.totalSales,
    cost: data.salesCost,
    profit: data.grossProfit,
    percent: 100,
  }
  const purchaseTotalRow: BreakdownRow = {
    name: 'Total Items',
    qty: data.purchaseQty,
    amount: data.purchaseValue,
    incentive: data.purchaseIncentive,
    actualPurchase: data.purchaseDeposit,
    percent: 100,
  }
  const expenseTotalRow: BreakdownRow = {
    name: 'Total Items',
    amount: data.totalExpenses,
    percent: data.totalExpenses > 0 ? 100 : 0,
  }
  const supplierPaymentTotalRow: BreakdownRow = {
    name: 'Total Items',
    amount: data.purchaseValue,
    qty: data.purchaseQty,
    paid: data.supplierPayments,
    due: data.purchaseValue - data.supplierPayments,
  }
  const otherIncomeTotalRow: BreakdownRow = {
    name: 'Total Items',
    type: '-',
    amount: data.totalOtherIncome,
    percent: data.totalOtherIncome > 0 ? 100 : 0,
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 lg:p-6">
      <PageHeader
        title="Report"
        subtitle="Global sales, purchase and profit analytics"
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-slate-500">Filter Mode</span>
              <select className="min-w-[96px] bg-transparent outline-none" value={filterMode} onChange={event => setFilterMode(event.target.value as FilterMode)}>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {filterMode === 'monthly' ? (
              <>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  <CalendarDays size={16} className="text-slate-400" />
                  <select className="min-w-[120px] bg-transparent outline-none" value={selectedMonth} onChange={event => setSelectedMonth(Number(event.target.value))}>
                    {monthOptions.map(month => <option key={month} value={month}>{monthName(month)}</option>)}
                    {monthOptions.length === 0 && <option value={selectedMonth}>{monthName(selectedMonth)}</option>}
                  </select>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  <select className="min-w-[90px] bg-transparent outline-none" value={selectedYear} onChange={event => handleYearChange(Number(event.target.value))}>
                    {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                    {yearOptions.length === 0 && <option value={selectedYear}>{selectedYear}</option>}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Start Date</span>
                  <input type="date" className="bg-transparent outline-none" value={customStart} onChange={event => setCustomStart(event.target.value)} />
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500">End Date</span>
                  <input type="date" className="bg-transparent outline-none" value={customEnd} onChange={event => setCustomEnd(event.target.value)} />
                </label>
              </>
            )}
            <button onClick={loadReport} className="btn-secondary h-10">
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        )}
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-green border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-3xl font-black text-blue-700">{range.label}</p>
              <p className="text-xs font-bold uppercase text-blue-700">Overview</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-green-100 bg-green-50 p-2">
                <p className="text-[10px] font-semibold uppercase text-green-700">Sales</p>
                <p className="text-sm font-bold text-green-800">{percentText(salesAchievedPct)}</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-2">
                <p className="text-[10px] font-semibold uppercase text-blue-700">Profit</p>
                <p className="text-sm font-bold text-blue-800">{percentText(profitAchievedPct)}</p>
              </div>
            </div>
            <div className="mt-3">
              <OverviewLine icon={<CalendarDays size={14} />} label="Start Date" value={formatDateShort(range.start)} />
              <OverviewLine icon={<CalendarDays size={14} />} label="End Date" value={formatDateShort(range.end)} />
              <OverviewLine icon={<Target size={14} />} label="Sales Target" value={formatCurr(data.salesTarget)} />
              <OverviewLine icon={<Target size={14} />} label="Profit Target" value={formatCurr(data.profitTarget)} />
              <OverviewLine icon={<Package size={14} />} label="Total Purchase" value={formatCurr(data.purchaseValue)} />
              <OverviewLine icon={<WalletCards size={14} />} label="Incentive Profit" value={formatCurr(data.purchaseIncentive)} tone="blue" />
              <OverviewLine icon={<TrendingUp size={14} />} label="Actual Sales" value={formatCurr(data.totalSales)} />
              <OverviewLine icon={<TrendingUp size={14} />} label="Actual Sales Profit" value={formatCurr(data.grossProfit)} tone="green" />
              <OverviewLine icon={<WalletCards size={14} />} label="Other Income" value={formatCurr(data.totalOtherIncome)} tone="green" />
              <OverviewLine icon={<ClipboardList size={14} />} label="Expenses" value={formatCurr(data.totalExpenses)} tone="red" />
              <OverviewLine icon={<CheckCircle2 size={14} />} label="Profit / Loss" value={formatCurr(data.profitLoss)} tone={data.profitLoss >= 0 ? 'green' : 'red'} />
              <OverviewLine icon={<CreditCard size={14} />} label="Profit Withdraw" value={formatCurr(data.profitWithdraw)} tone="red" />
              <OverviewLine icon={<WalletCards size={14} />} label="Available Profit" value={formatCurr(data.availableProfit)} tone={data.availableProfit >= 0 ? 'green' : 'red'} />
            </div>
          </aside>

          <main className="min-w-0 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-6">
              <ProgressCard title="Sales Target Achievements" value={data.totalSales} target={data.salesTarget} progress={salesAchievedPct} tone="blue" />
              <ProgressCard title="Profit Targets" value={achievedProfit} target={data.profitTarget} progress={profitAchievedPct} tone="green" />
              <MetricCard title="Incentive Profit" value={formatCurr(data.purchaseIncentive)} subtitle="SP amount from purchase items" />
              <MetricCard title="Other Income" value={formatCurr(data.totalOtherIncome)} subtitle="Supplier and other sources" />
              <MetricCard title="Total Expenses" value={formatCurr(data.totalExpenses)} subtitle={`${percentText(pct(data.totalExpenses, data.totalSales))} of sales`} />
              <MetricCard title="Profit / Loss" value={formatCurr(data.profitLoss)} subtitle={`${profitMargin.toFixed(2)}% margin`} />
            </div>

            <div className="grid w-full grid-cols-1 gap-4">
              <ReportBreakdownTable
                title="Sales & Profit"
                rows={data.salesBreakdown}
                totalRow={salesTotalRow}
                minWidth="980px"
                columns={[
                  { label: 'Product Name', render: row => clippedName(row) },
                  { label: 'Sales QTY', align: 'right', render: row => formatNum(amount(row.qty)) },
                  { label: 'Sales Amount', align: 'right', render: row => formatCurr(row.amount) },
                  { label: 'Cost', align: 'right', render: row => formatCurr(amount(row.cost)) },
                  { label: 'Profit', align: 'right', render: row => formatCurr(amount(row.profit)) },
                  { label: 'Breakdown %', align: 'right', render: row => breakdownText(amount(row.percent)) },
                ]}
              />
              <ReportBreakdownTable
                title="Purchase"
                rows={data.purchaseBreakdown}
                totalRow={purchaseTotalRow}
                minWidth="980px"
                columns={[
                  { label: 'Product Name', render: row => clippedName(row) },
                  { label: 'Purchase QTY', align: 'right', render: row => formatNum(amount(row.qty)) },
                  { label: 'Amount', align: 'right', render: row => formatCurr(row.amount) },
                  { label: 'SP Amount', align: 'right', render: row => formatCurr(amount(row.incentive)) },
                  { label: 'Actual Purchase', align: 'right', render: row => formatCurr(amount(row.actualPurchase)) },
                  { label: 'Breakdown %', align: 'right', render: row => breakdownText(amount(row.percent)) },
                ]}
              />
              <ReportBreakdownTable
                title="Expenses"
                rows={data.expenseBreakdown}
                totalRow={expenseTotalRow}
                minWidth="760px"
                columns={[
                  { label: 'Expense Category', render: row => clippedName(row) },
                  { label: 'Amount', align: 'right', render: row => formatCurr(row.amount) },
                  { label: 'Breakdown %', align: 'right', render: row => breakdownText(amount(row.percent)) },
                ]}
              />
              <div className="grid w-full grid-cols-1 gap-4 2xl:grid-cols-2">
                <ReportBreakdownTable
                  title="Supplier Payment"
                  rows={data.supplierPaymentBreakdown}
                  totalRow={supplierPaymentTotalRow}
                  minWidth="640px"
                  columns={[
                    { label: 'Supplier', render: row => clippedName(row) },
                    { label: 'Order Amount', align: 'right', render: row => formatCurr(row.amount) },
                    { label: 'QTY', align: 'right', render: row => formatNum(amount(row.qty)) },
                    { label: 'Payment', align: 'right', render: row => formatCurr(amount(row.paid)) },
                    { label: 'Due', align: 'right', render: row => formatCurr(amount(row.due)) },
                  ]}
                />
                <ReportBreakdownTable
                  title="Other Income"
                  rows={data.otherIncomeBreakdown}
                  totalRow={otherIncomeTotalRow}
                  minWidth="640px"
                  columns={[
                    { label: 'Supplier / Source', render: row => clippedName(row) },
                    { label: 'Type', align: 'right', render: row => row.type || '-' },
                    { label: 'Amount', align: 'right', render: row => formatCurr(row.amount) },
                    { label: 'Breakdown %', align: 'right', render: row => breakdownText(amount(row.percent)) },
                  ]}
                />
              </div>
            </div>

            <div className="text-right text-xs text-slate-400">
              Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
