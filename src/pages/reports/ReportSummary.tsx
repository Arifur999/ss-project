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
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { readOtherIncomeFallbackRows } from '../../lib/otherIncomeFallback'
import { calculateRollingTargets, getDaysInMonth } from '../../lib/rollingTarget'
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
  companyWayRows: CompanyWayRow[]
  dailyPerformance: DailyPerformanceRow[]
}

type CompanyWayRow = {
  company: string
  purchase: number
  sales: number
}

type DailyPerformanceRow = {
  label: string
  date: string
  target: number
  sales: number
  profit: number
  expense: number
  /** Monthly target still left after this day's sales. */
  remainingTarget: number
  /** What the following day is being asked to do; null on the month's last day. */
  nextTarget: number | null
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
  companyWayRows: [],
  dailyPerformance: [],
}

function companyName(value: string | null | undefined) {
  const name = String(value || '').trim()
  return name || 'Unassigned'
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

// Where a month sits relative to `today` (an ISO date): which days are settled
// and which one is still in progress. A past month is entirely settled, a future
// month has not started, and the current month is settled up to yesterday with
// today still running.
function monthProgress(year: number, month: number, today: string) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const currentMonthKey = today.slice(0, 7)
  if (monthKey < currentMonthKey) return { completedThroughDay: getDaysInMonth(year, month), inProgressDay: 0 }
  if (monthKey > currentMonthKey) return { completedThroughDay: 0, inProgressDay: 0 }
  const day = Number(today.slice(8, 10))
  return { completedThroughDay: day - 1, inProgressDay: day }
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

      const [salesRes, purchasesRes, expensesRes, supplierPaymentsRes, targetsRes, withdrawRes, otherIncomeRes, productsRes] = await Promise.all([
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
        // Maps each product to the company it comes from, for the Company ways
        // Report. Not date filtered - it is a lookup, same as the Yearly page.
        supabase
          .from('products')
          .select('id, product_code, suppliers(name, company_name)'),
      ])

      if (salesRes.error) throw salesRes.error
      if (purchasesRes.error) throw purchasesRes.error
      if (expensesRes.error) throw expensesRes.error
      if (supplierPaymentsRes.error) throw supplierPaymentsRes.error
      if (targetsRes.error) throw targetsRes.error
      if (withdrawRes.error) throw withdrawRes.error
      if (otherIncomeRes.error && !isMissingTableError(otherIncomeRes.error, 'other_incomes')) throw otherIncomeRes.error
      if (productsRes.error) throw productsRes.error

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
          // With no purchase rate on the line the profit is unknowable, so it
          // counts as zero. Booking the whole sale as profit would inflate every
          // profit figure on this page. Same rule as the Sales Ledger and the
          // Monthly / Yearly reports.
          const cost = unitCost > 0 ? unitCost * qty : 0
          const profit = unitCost > 0 ? saleAmount - cost : 0
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

      // Company ways Report: purchase comes straight off each purchase's
      // supplier, sales are traced back through the product to its company.
      // Same rules as the Yearly page, just over the selected period.
      const productCompanyMap = new Map<string, string>()
      ;(productsRes.data || []).forEach((product: any) => {
        const supplier = Array.isArray(product.suppliers) ? product.suppliers[0] : product.suppliers
        const name = companyName(supplier?.company_name || supplier?.name)
        if (product.id) productCompanyMap.set(product.id, name)
        if (product.product_code) productCompanyMap.set(product.product_code, name)
      })

      const companyMap: Record<string, CompanyWayRow> = {}
      purchases.forEach((purchase: any) => {
        const company = companyName(purchase.supplier_name)
        const current = companyMap[company] || { company, purchase: 0, sales: 0 }
        const itemTotal = (purchase.purchase_items || []).reduce((sum: number, item: any) => sum + amount(item.total_amount), 0)
        current.purchase += itemTotal || amount(purchase.total_amount || purchase.net_amount)
        companyMap[company] = current
      })
      sales.forEach((sale: any) => {
        (sale.sale_items || []).forEach((item: any) => {
          const company = companyName(productCompanyMap.get(item.product_id) || productCompanyMap.get(item.product_code))
          const current = companyMap[company] || { company, purchase: 0, sales: 0 }
          // Same basis as the Sales & Profit table: the discounted amount that
          // was actually billed. Using selling_price (the pre-discount MRP)
          // inflated these rows by the whole discount.
          const qty = amount(item.qty)
          current.sales += amount(item.total_amount) || amount(item.actual_price) * qty || amount(item.selling_price) * qty
          companyMap[company] = current
        })
      })
      const companyWayRows = Object.values(companyMap)
        .sort((a, b) => (b.purchase + b.sales) - (a.purchase + a.sales))

      const profitWithdraw = withdrawals.reduce((sum: number, withdrawal: any) => sum + amount(withdrawal.amount), 0)
      const profitLoss = grossProfit + purchaseIncentive + totalOtherIncome - totalExpenses

      // Daily performance series: one bucket per calendar day in the range with
      // Sales / Profit / Expense, so the overview chart can show four bars per
      // day. The Target bar is filled in further down by the rolling engine.
      const dailyMap: Record<string, { sales: number; profit: number; expense: number }> = {}
      const ensureDay = (key: string) => (dailyMap[key] || (dailyMap[key] = { sales: 0, profit: 0, expense: 0 }))
      let cursor = range.start
      let guard = 0
      while (cursor <= range.end && guard < 400) {
        ensureDay(cursor)
        const step = new Date(`${cursor}T12:00:00`)
        step.setDate(step.getDate() + 1)
        cursor = isoDate(step)
        guard += 1
      }
      sales.forEach((sale: any) => {
        const key = String(sale.date || '').slice(0, 10)
        if (!key) return
        const bucket = ensureDay(key)
        bucket.sales += amount(sale.net_amount || sale.subtotal)
        bucket.profit += (sale.sale_items || []).reduce((sum: number, item: any) => {
          const qty = amount(item.qty)
          const saleAmount = amount(item.total_amount) || amount(item.actual_price) * qty || amount(item.selling_price) * qty
          const unitCost = amount(item.cost_price)
          // No purchase rate -> no known profit for this line (see above).
          if (unitCost <= 0) return sum
          return sum + (saleAmount - unitCost * qty)
        }, 0)
      })
      expenses.forEach((expense: any) => {
        const key = String(expense.date || '').slice(0, 10)
        if (!key) return
        ensureDay(key).expense += amount(expense.amount)
      })
      // Other income is a form of profit too, so fold it into each day's profit
      // bar (the owner wanted it visible in the performance chart).
      otherIncomes.forEach((income: any) => {
        const key = String(income.date || '').slice(0, 10)
        if (!key) return
        ensureDay(key).profit += amount(income.amount)
      })
      const dailyKeys = Object.keys(dailyMap).sort()

      // Target bars. The rolling rule is defined over whole calendar months, so
      // a custom range that starts or ends mid-month still needs that month's
      // other days - without them the remaining target would look bigger than it
      // really is. Monthly mode already spans a full month, so it reuses the
      // rows fetched above and fires no extra request.
      const spanStart = `${range.start.slice(0, 7)}-01`
      const spanEnd = isoDate(new Date(Number(range.end.slice(0, 4)), Number(range.end.slice(5, 7)), 0))
      let targetSales: any[] = sales
      if (spanStart !== range.start || spanEnd !== range.end) {
        const spanRes = await supabase
          .from('sales')
          .select('date, subtotal, net_amount')
          .eq('status', 'completed')
          .gte('date', spanStart)
          .lte('date', spanEnd)
        if (spanRes.error) throw spanRes.error
        targetSales = spanRes.data || []
      }

      const salesByMonth: Record<string, Record<number, number>> = {}
      targetSales.forEach((sale: any) => {
        const saleDate = String(sale.date || '').slice(0, 10)
        const day = Number(saleDate.slice(8, 10))
        if (saleDate.length < 10 || !day) return
        const key = saleDate.slice(0, 7)
        const perDay = salesByMonth[key] || (salesByMonth[key] = {})
        perDay[day] = (perDay[day] || 0) + amount(sale.net_amount || sale.subtotal)
      })

      const targetByMonth: Record<string, number> = {}
      targets.forEach((target: any) => {
        const targetYear = Number(target.year || 0)
        const targetMonth = Number(target.month || 0)
        if (!targetYear || targetMonth < 1 || targetMonth > 12) return
        const key = `${targetYear}-${String(targetMonth).padStart(2, '0')}`
        targetByMonth[key] = (targetByMonth[key] || 0) + amount(target.sales_target)
      })

      // One rolling pass per month the chart touches, then every day reads its
      // own target back out. Both filter modes go through this, so 5 August
      // shows the same bar whichever way you got there.
      const today = isoDate(new Date())
      const targetByDate: Record<string, number> = {}
      const remainingByDate: Record<string, number> = {}
      Array.from(new Set(dailyKeys.map(key => key.slice(0, 7)))).forEach(key => {
        const monthYear = Number(key.slice(0, 4))
        const monthNumber = Number(key.slice(5, 7))
        calculateRollingTargets({
          monthlyTarget: targetByMonth[key] || 0,
          year: monthYear,
          month: monthNumber,
          dailySalesMap: salesByMonth[key] || {},
          ...monthProgress(monthYear, monthNumber, today),
        }).dailyRecords.forEach(record => {
          targetByDate[record.dateString] = record.openingTarget
          remainingByDate[record.dateString] = record.remainingTargetAfterSales
        })
      })

      const nextDateOf = (key: string) => {
        const step = new Date(`${key}T12:00:00`)
        step.setDate(step.getDate() + 1)
        return isoDate(step)
      }

      const dailyPerformance: DailyPerformanceRow[] = dailyKeys.map(key => {
        const bucket = dailyMap[key]
        // The engine emits every day of each month it runs on, so the lookup
        // still resolves for days just outside the selected range - it only
        // comes up empty past the last month the chart covers.
        const nextKey = nextDateOf(key)
        return {
          label: String(Number(key.slice(8, 10))),
          date: key,
          target: targetByDate[key] || 0,
          sales: bucket.sales,
          profit: bucket.profit,
          expense: bucket.expense,
          remainingTarget: remainingByDate[key] || 0,
          nextTarget: nextKey in targetByDate ? targetByDate[nextKey] : null,
        }
      })

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
        companyWayRows,
        dailyPerformance,
      })
      setLastUpdated(new Date())
    } catch (err: any) {
      toast.error(err.message || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const companyWayTotals = useMemo(() => data.companyWayRows.reduce((totals, row) => ({
    purchase: totals.purchase + row.purchase,
    sales: totals.sales + row.sales,
  }), { purchase: 0, sales: 0 }), [data.companyWayRows])

  const salesAchievedPct = pct(data.totalSales, data.salesTarget)
  const achievedProfit = data.grossProfit + data.purchaseIncentive + data.totalOtherIncome
  const profitAchievedPct = pct(achievedProfit, data.profitTarget)
  const profitMargin = data.totalSales > 0 ? (data.profitLoss / data.totalSales) * 100 : 0

  // Width so 4 bars per day stay readable; scrolls horizontally when the month
  // has many days on a narrow screen.
  const chartInnerWidth = Math.max(680, data.dailyPerformance.length * 42)

  // Chart tooltip: the four bar values, plus how much of the monthly target is
  // still open after this day and what the next day is being asked to do.
  function PerformanceTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload as DailyPerformanceRow | undefined
    if (!row) return null

    const bars = [
      { label: 'Target', value: row.target, swatch: '#94a3b8' },
      { label: 'Sales', value: row.sales, swatch: '#0b0b0f' },
      { label: 'Profit', value: row.profit, swatch: '#1D9E75' },
      { label: 'Expense', value: row.expense, swatch: '#E24B4A' },
    ]

    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
        <p className="text-xs font-bold text-slate-900">Day {row.label}</p>
        <p className="mb-2 text-[10px] font-medium text-slate-400">{formatDateShort(row.date)}</p>
        <div className="space-y-1">
          {bars.map(bar => (
            <div key={bar.label} className="flex items-center justify-between gap-8 text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-slate-500">
                <span className="h-2 w-2 rounded-sm" style={{ background: bar.swatch }} />
                {bar.label}
              </span>
              <span className="font-semibold text-slate-900">{formatCurr(bar.value)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          <div className="flex items-center justify-between gap-8 text-[11px]">
            <span className="font-medium text-slate-500">Remaining target</span>
            <span className="font-semibold text-slate-900">{formatCurr(row.remainingTarget)}</span>
          </div>
          <div className="flex items-center justify-between gap-8 text-[11px]">
            <span className="font-medium text-slate-500">Next day target</span>
            <span className="font-semibold text-slate-900">
              {row.nextTarget === null ? '—' : formatCurr(row.nextTarget)}
            </span>
          </div>
        </div>
      </div>
    )
  }

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
    const bar = tone === 'blue' ? 'bg-slate-900' : 'bg-brand-green'

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
    valueClassName,
  }: {
    title: string
    value: string
    subtitle?: string
    valueClassName?: string
  }) {
    // Money that has gone the wrong way should read that way without anyone
    // having to check the sign. An explicit valueClassName still wins, so a
    // card that wants its own colour keeps it.
    const isNegative = value.includes("-")
    const toneClass = valueClassName || (isNegative ? "text-brand-red" : "text-slate-900")

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className={`mt-1 text-xl font-bold leading-tight tabular-nums ${toneClass}`}>{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
    )
  }

  function OverviewLine({ icon, label, value, tone = 'slate' }: { icon: React.ReactNode; label: string; value: string; tone?: 'green' | 'red' | 'blue' | 'slate' }) {
    const toneClass = {
      green: 'text-brand-green',
      red: 'text-brand-red',
      blue: 'text-slate-700',
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
                  <select className="min-w-[120px] flex-1 bg-transparent outline-none" value={selectedMonth} onChange={event => setSelectedMonth(Number(event.target.value))}>
                    {monthOptions.map(month => <option key={month} value={month}>{monthName(month)}</option>)}
                    {monthOptions.length === 0 && <option value={selectedMonth}>{monthName(selectedMonth)}</option>}
                  </select>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  <CalendarDays size={16} className="text-slate-400" />
                  <select className="min-w-[120px] flex-1 bg-transparent outline-none" value={selectedYear} onChange={event => handleYearChange(Number(event.target.value))}>
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
            <div className="rounded-lg bg-slate-900 p-4">
              <p className="text-3xl font-black text-white">{range.label}</p>
              <p className="text-xs font-bold uppercase text-slate-400">Overview</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-green-100 bg-green-50 p-2">
                <p className="text-[10px] font-semibold uppercase text-green-700">Sales</p>
                <p className="text-sm font-bold text-green-800">{percentText(salesAchievedPct)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-100 p-2">
                <p className="text-[10px] font-semibold uppercase text-slate-600">Profit</p>
                <p className="text-sm font-bold text-slate-800">{percentText(profitAchievedPct)}</p>
              </div>
            </div>
            <div className="mt-3">
              <OverviewLine icon={<CalendarDays size={14} />} label="Start Date" value={formatDateShort(range.start)} />
              <OverviewLine icon={<CalendarDays size={14} />} label="End Date" value={formatDateShort(range.end)} />
              <OverviewLine icon={<Target size={14} />} label="Sales Target" value={formatCurr(data.salesTarget)} />
              <OverviewLine icon={<Target size={14} />} label="Profit Target" value={formatCurr(data.profitTarget)} />
              <OverviewLine icon={<Package size={14} />} label="Total Purchase" value={formatCurr(data.purchaseValue)} />
              <OverviewLine icon={<WalletCards size={14} />} label="Incentive Profit" value={formatCurr(data.purchaseIncentive)} tone="green" />
              <OverviewLine icon={<TrendingUp size={14} />} label="Actual Sales" value={formatCurr(data.totalSales)} />
              <OverviewLine icon={<TrendingUp size={14} />} label="Actual Sales Profit" value={formatCurr(data.grossProfit)} tone="green" />
              <OverviewLine icon={<WalletCards size={14} />} label="Other Income" value={formatCurr(data.totalOtherIncome)} tone="green" />
              <OverviewLine icon={<ClipboardList size={14} />} label="Expenses" value={formatCurr(data.totalExpenses)} tone="red" />
              <OverviewLine icon={<CheckCircle2 size={14} />} label="Profit / Loss" value={formatCurr(data.profitLoss)} tone={data.profitLoss >= 0 ? 'green' : 'red'} />
              <OverviewLine icon={<CreditCard size={14} />} label="Profit Withdraw" value={formatCurr(data.profitWithdraw)} tone="red" />
              <OverviewLine icon={<WalletCards size={14} />} label="Available Profit" value={formatCurr(data.availableProfit)} tone={data.availableProfit >= 0 ? 'green' : 'red'} />
            </div>

            <section className="mt-4 flex h-[260px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="bg-blue-800 px-3 py-2 text-center text-xs font-bold text-white">Company ways Report</div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full table-fixed text-[10px]">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="w-[42%] px-2 py-2 text-left font-bold">Company</th>
                      <th className="w-[29%] px-1.5 py-2 text-right font-bold">Purchase</th>
                      <th className="w-[29%] px-1.5 py-2 text-right font-bold">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.companyWayRows.map(row => (
                      <tr key={row.company} className="border-t border-slate-100">
                        <td className="truncate px-2 py-1.5 font-medium text-slate-700" title={row.company}>{row.company}</td>
                        <td className="whitespace-nowrap px-1.5 py-1.5 text-right font-semibold tabular-nums text-slate-700">{formatCurr(row.purchase)}</td>
                        <td className="whitespace-nowrap px-1.5 py-1.5 text-right font-semibold tabular-nums text-brand-green">{formatCurr(row.sales)}</td>
                      </tr>
                    ))}
                    {data.companyWayRows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-2 py-8 text-center text-xs font-medium text-slate-400">No company data</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-[42%_29%_29%] bg-slate-800 text-[10px] font-bold text-white">
                <div className="px-2 py-2">Total</div>
                <div className="px-1.5 py-2 text-right tabular-nums">{formatCurr(companyWayTotals.purchase)}</div>
                <div className="px-1.5 py-2 text-right tabular-nums">{formatCurr(companyWayTotals.sales)}</div>
              </div>
            </section>
          </aside>

          <main className="min-w-0 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-6">
              <ProgressCard title="Sales Target Achievements" value={data.totalSales} target={data.salesTarget} progress={salesAchievedPct} tone="blue" />
              <ProgressCard title="Profit Targets" value={achievedProfit} target={data.profitTarget} progress={profitAchievedPct} tone="green" />
              <MetricCard title="Incentive Profit" value={formatCurr(data.purchaseIncentive)} subtitle="SP amount from purchase items" valueClassName="text-brand-green" />
              <MetricCard title="Other Income" value={formatCurr(data.totalOtherIncome)} subtitle="Supplier and other sources" />
              <MetricCard title="Total Expenses" value={formatCurr(data.totalExpenses)} subtitle={`${percentText(pct(data.totalExpenses, data.totalSales))} of sales`} valueClassName="text-brand-red" />
              <MetricCard title="Profit / Loss" value={formatCurr(data.profitLoss)} subtitle={`${profitMargin.toFixed(2)}% margin`} />
            </div>

            <div className="grid w-full grid-cols-1 gap-4">
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="bg-slate-800 px-4 py-3 text-center">
                  <h2 className="text-sm font-black uppercase tracking-[0.28em] text-white">Performance Overview</h2>
                </div>
                <div className="overflow-x-auto px-3 py-5 sm:px-5">
                  <div style={{ minWidth: chartInnerWidth }}>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={data.dailyPerformance} margin={{ top: 16, right: 8, left: 4, bottom: 4 }} barCategoryGap="18%" barGap={1}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={value => `${Math.round(Number(value) / 1000)}k`} axisLine={false} tickLine={false} width={46} />
                        <Tooltip content={<PerformanceTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                        <Bar dataKey="target" name="Target" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="sales" name="Sales" fill="#0b0b0f" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="profit" name="Profit" fill="#1D9E75" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="expense" name="Expense" fill="#E24B4A" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
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
