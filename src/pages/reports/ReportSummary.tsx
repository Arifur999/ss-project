import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDotsIcon as CalendarDays, CheckCircleIcon as CheckCircle2, ClipboardTextIcon as ClipboardList, ArrowsClockwiseIcon as RefreshCw, TargetIcon as Target, TrendUpIcon as TrendingUp, WalletIcon as WalletCards } from '@phosphor-icons/react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { readOtherIncomeFallbackRows } from '../../lib/otherIncomeFallback'
import { profitLoss as profitLossOf, type ProfitInputs } from '../../lib/profit'
import { purchaseItemDeposit } from '../../lib/purchaseAmounts'
import { monthKey, purchaseProgressForMonth, type MonthProgress } from '../../lib/purchaseRollingTarget'
import { calculateRollingTargets, getDaysInMonth } from '../../lib/rollingTarget'
import { supabase } from '../../lib/supabase'
import { isMissingTableError } from '../../lib/supabaseErrors'
import { firstAmount, roundTaka, saleItemAmount } from '../../lib/utils'
import toast from 'react-hot-toast'
import { NoValue } from '../../components/CellValue'
import { CHART_GREEN, CHART_MUTED, KpiCard, PeriodCard, PurchaseTargetDonut } from '../../components/ReportCards'

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
  /** What is owed on these lines: total less the SP incentive. `due` is this minus `paid`. */
  owed?: number
  due?: number
  percent?: number
}

type ReportData = {
  salesTarget: number
  profitTarget: number
  totalSales: number
  salesCost: number
  grossProfit: number
  /** Revenue whose purchase rate is missing, so its profit reads as zero. */
  uncostedSales: number
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
  monthlyPurchaseRows: MonthlyPurchaseRow[]
  monthlyPurchaseMonth: string
  dailyPerformance: DailyPerformanceRow[]
}

type MonthlyPurchaseRow = {
  company: string
  target: number
  achieved: number
  extra: number
  nextMonthTarget: number
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

/**
 * The five reports, shown one at a time.
 *
 * Only identity lives here - each report's columns stay at its call site,
 * beside the data they read, because they are the one thing that differs
 * between them and moving them out would say less, not more.
 */
type ReportTabKey = 'sales' | 'purchases' | 'expenses' | 'supplier' | 'otherIncome'

const REPORT_TABS: { key: ReportTabKey; label: string }[] = [
  { key: 'sales', label: 'Sales Report' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'supplier', label: 'Supplier Payment' },
  { key: 'otherIncome', label: 'Other Income' },
]

const emptyReport: ReportData = {
  salesTarget: 0,
  profitTarget: 0,
  totalSales: 0,
  salesCost: 0,
  grossProfit: 0,
  uncostedSales: 0,
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
  monthlyPurchaseRows: [],
  monthlyPurchaseMonth: '',
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

// Every money field on this page comes in through here, and it rounds to the
// whole taka on the way in rather than at display time. That is what keeps a
// breakdown table's rows adding up to the total printed under it: rounding only
// on the way out would show two rows of 10.4 as "10" and "10" beneath a total
// of "21".
function amount(value: any) {
  return roundTaka(value)
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
  const { t, formatCurr, formatNum, formatDateShort, monthName } = useLang()
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
  const [reportTab, setReportTab] = useState<ReportTabKey>(REPORT_TABS[0].key)

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

      const [salesRes, purchasesRes, expensesRes, supplierPaymentsRes, targetsRes, withdrawRes, otherIncomeRes, productsRes, purchaseTargetsRes, allPurchasesRes] = await Promise.all([
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
        // Buying targets per supplier. Not date filtered: which of them covers
        // the reported month is decided below, from their own ranges.
        supabase.from('purchase_targets').select('*'),
        // Purchases with no date filter, because a rolling target reads every
        // month from its start - what was bought in March changes what April
        // is asked for, and April is what this panel shows.
        supabase.from('purchases').select('date, supplier_id, total_amount, net_amount, purchase_items(total_amount)'),
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

      const totalSales = sales.reduce((sum: number, sale: any) => sum + firstAmount(sale.net_amount, sale.subtotal), 0)
      const saleProductMap: Record<string, BreakdownRow> = {}
      // Sales whose purchase rate was never entered. Their profit is unknowable
      // so it counts as zero, which quietly understates every profit figure on
      // the page - the card says so rather than leaving it to be assumed.
      let uncostedSales = 0
      sales.forEach((sale: any) => {
        (sale.sale_items || []).forEach((item: any) => {
          const name = item.product_name || 'Unknown Product'
          const qty = amount(item.qty)
          const saleAmount = saleItemAmount(item, qty)
          const unitCost = amount(item.cost_price)
          // With no purchase rate on the line the profit is unknowable, so it
          // counts as zero. Booking the whole sale as profit would inflate every
          // profit figure on this page. Same rule as the Sales Ledger and the
          // Monthly / Yearly reports.
          const cost = unitCost > 0 ? unitCost * qty : 0
          const profit = unitCost > 0 ? saleAmount - cost : 0
          if (unitCost <= 0) uncostedSales += saleAmount
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
      const purchaseValue = purchases.reduce((sum: number, purchase: any) => sum + firstAmount(purchase.net_amount, purchase.total_amount), 0)
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
        const purchaseAmount = firstAmount(purchase.net_amount, purchase.total_amount)
        const items = purchase.purchase_items || []
        const qty = items.reduce((sum: number, item: any) => sum + amount(item.qty), 0)
        const current = supplierPaymentMap[key] || { name, qty: 0, amount: 0, owed: 0, paid: 0, due: 0 }
        current.qty = amount(current.qty) + qty
        current.amount += purchaseAmount
        // Owed is the total less the SP incentive - the same basis as the Supplier
        // Dashboard's balance and the Purchase Ledger's Grand Total. The Due
        // column was amount - paid, which never deducted the incentive.
        current.owed = amount(current.owed) + items.reduce((sum: number, item: any) => sum + purchaseItemDeposit(item), 0)
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
        .map(row => ({ ...row, due: amount(row.owed) - amount(row.paid), percent: pct(row.amount, purchaseValue) }))
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
          current.sales += saleItemAmount(item, qty)
          companyMap[company] = current
        })
      })
      const companyWayRows = Object.values(companyMap)
        .sort((a, b) => (b.purchase + b.sales) - (a.purchase + a.sales))

      /*
       * Monthly Purchase: how each company stands against its buying target
       * for the month this report is about.
       *
       * The month is the one the range ends in - the page is month-shaped
       * ("August 2026" in the overview), and a range that stops mid-month is
       * still reporting on that month.
       */
      const reportMonthDate = new Date(`${range.end}T12:00:00`)
      const reportYear = reportMonthDate.getFullYear()
      const reportMonth = reportMonthDate.getMonth() + 1

      const purchaseTargets = purchaseTargetsRes.error ? [] : (purchaseTargetsRes.data || [])
      const allPurchases = allPurchasesRes.error ? [] : (allPurchasesRes.data || [])

      // Bought per supplier per month, over all time - the rolling figure for
      // this month is built from every month before it.
      const boughtBySupplier: Record<string, Record<string, number>> = {}
      allPurchases.forEach((purchase: any) => {
        const supplierId = purchase.supplier_id
        if (!supplierId || !purchase.date) return
        const when = new Date(`${String(purchase.date).slice(0, 10)}T12:00:00`)
        const key = monthKey(when.getFullYear(), when.getMonth() + 1)
        const itemTotal = (purchase.purchase_items || []).reduce((sum: number, item: any) => sum + amount(item.total_amount), 0)
        const value = itemTotal || amount(purchase.total_amount || purchase.net_amount)
        const perSupplier = boughtBySupplier[supplierId] || (boughtBySupplier[supplierId] = {})
        perSupplier[key] = (perSupplier[key] || 0) + value
      })

      const supplierNameById = new Map<string, string>()
      purchaseTargets.forEach((target: any) => {
        const supplier = Array.isArray(target.supplier) ? target.supplier[0] : target.supplier
        if (target.supplier_id) supplierNameById.set(target.supplier_id, companyName(supplier?.company_name || supplier?.name))
      })

      const monthlyPurchaseRows: MonthlyPurchaseRow[] = purchaseTargets
        .map((target: any): MonthlyPurchaseRow | null => {
          const progress: MonthProgress = purchaseProgressForMonth(
            {
              start_year: Number(target.start_year),
              start_month: Number(target.start_month),
              end_year: Number(target.end_year),
              end_month: Number(target.end_month),
              total_amount: amount(target.total_amount),
            },
            boughtBySupplier[target.supplier_id] || {},
            reportYear,
            reportMonth,
          )
          // A target that does not cover this month has nothing to say about it.
          if (!progress.inRange) return null
          return {
            company: supplierNameById.get(target.supplier_id) || companyName(''),
            target: progress.target,
            achieved: progress.achieved,
            extra: progress.extra,
            nextMonthTarget: progress.nextMonthTarget,
          }
        })
        .filter((row): row is MonthlyPurchaseRow => row !== null)
        .sort((a, b) => b.target - a.target)

      const profitWithdraw = withdrawals.reduce((sum: number, withdrawal: any) => sum + amount(withdrawal.amount), 0)
      // This page already had the definition the owner uses; it now reads it from
      // lib/profit.ts so the Yearly page and the Dashboard cannot drift from it
      // again the way they had.
      const profitInputs: ProfitInputs = {
        grossProfit,
        purchaseIncentive,
        otherIncome: totalOtherIncome,
        expenses: totalExpenses,
      }
      const profitLoss = profitLossOf(profitInputs)

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
        bucket.sales += firstAmount(sale.net_amount, sale.subtotal)
        bucket.profit += (sale.sale_items || []).reduce((sum: number, item: any) => {
          const qty = amount(item.qty)
          const saleAmount = saleItemAmount(item, qty)
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
        perDay[day] = (perDay[day] || 0) + firstAmount(sale.net_amount, sale.subtotal)
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
        uncostedSales,
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
        monthlyPurchaseRows,
        monthlyPurchaseMonth: `${reportYear}-${String(reportMonth).padStart(2, '0')}`,
        dailyPerformance,
      })
      setLastUpdated(new Date())
    } catch (err: any) {
      toast.error(err.message || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const monthlyPurchaseTotals = useMemo(() => (data.monthlyPurchaseRows || []).reduce((totals, row) => ({
    target: totals.target + row.target,
    achieved: totals.achieved + row.achieved,
    extra: totals.extra + row.extra,
  }), { target: 0, achieved: 0, extra: 0 }), [data.monthlyPurchaseRows])

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
        <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
          <div className="flex items-center justify-between gap-8 text-[11px]">
            <span className="font-medium text-slate-500">Remaining target</span>
            <span className="font-semibold text-slate-900">{formatCurr(row.remainingTarget)}</span>
          </div>
          <div className="flex items-center justify-between gap-8 text-[11px]">
            <span className="font-medium text-slate-500">Next day target</span>
            <span className="font-semibold text-slate-900">
              {row.nextTarget === null ? <NoValue /> : formatCurr(row.nextTarget)}
            </span>
          </div>
        </div>
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
    title?: string
    rows: BreakdownRow[]
    totalRow: BreakdownRow
    columns: TableColumn[]
    minWidth?: string
  }) {
    return (
      <section className={title ? 'overflow-hidden rounded-lg border border-surface-border bg-surface shadow-sm' : 'overflow-hidden'}>
        {title && (
          <div className="bg-slate-800 px-4 py-3 text-center">
            <h2 className="text-sm font-black uppercase tracking-[0.28em] text-white">{title}</h2>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth }}>
            {/* The site's own near-black header row. Every other table on the
                site uses `.table-header`; these five were the ones still on a
                white header, which is why the report read as a different
                product from the page it sits on. */}
            <thead className="table-header">
              {/* A notch smaller than the shared header size and without its
                  extra letter-spacing: uppercase labels are wider than the
                  sentence case they replaced, and six of them pushed
                  Breakdown % off the edge of the panel. */}
              <tr>
                {columns.map(column => (
                  <th key={column.label} className={`px-2.5 py-2.5 text-[11px] tracking-normal ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="bg-white font-black text-slate-900">
                {columns.map(column => (
                  <td
                    key={column.label}
                    className={`px-2.5 py-2 ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
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
                <tr key={`${row.name}-${rowIndex}`} className="hover:bg-white/70">
                  {columns.map(column => (
                    <td key={column.label} className={`px-2.5 py-2 ${column.align === 'right' ? 'text-right font-medium tabular-nums text-slate-800' : 'font-medium text-slate-800'}`}>
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
    type: '',
    amount: data.totalOtherIncome,
    percent: data.totalOtherIncome > 0 ? 100 : 0,
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 lg:p-6">
      <PageHeader
        title={t('nav_monthly')}
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
        <div className="space-y-5">
          {/* ── SECTION 01 — MONTHLY OVERVIEW ───────────────────────────── */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <PeriodCard
              label={range.label}
              caption="Monthly Overview"
              salesPct={percentText(salesAchievedPct)}
              profitPct={percentText(profitAchievedPct)}
            />

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label="Sales Target Achievement"
                icon={<Target size={17} weight="duotone" />}
                value={formatCurr(data.totalSales)}
                note={`${percentText(salesAchievedPct)} of ${formatCurr(data.salesTarget)}`}
                progress={salesAchievedPct}
              />
              <KpiCard
                label="Profit Target Achievement"
                icon={<TrendingUp size={17} weight="duotone" />}
                value={formatCurr(achievedProfit)}
                note={`${percentText(profitAchievedPct)} of ${formatCurr(data.profitTarget)}`}
                progress={profitAchievedPct}
              />
              {/* Two cards merged. Both are money the business earned outside a
                  sale, so the total is the useful figure - the split stays
                  underneath rather than costing a card of its own. */}
              <KpiCard
                label="Incentive + Other Income"
                icon={<WalletCards size={17} weight="duotone" />}
                value={formatCurr(data.purchaseIncentive + data.totalOtherIncome)}
                note={`Incentive ${formatCurr(data.purchaseIncentive)} · Other ${formatCurr(data.totalOtherIncome)}`}
                valueClassName="text-brand-green"
              />
              <KpiCard
                label="Total Expenses"
                icon={<ClipboardList size={17} weight="duotone" />}
                value={formatCurr(data.totalExpenses)}
                note={`${percentText(pct(data.totalExpenses, data.totalSales))} of sales`}
                valueClassName="text-brand-red"
              />
              <KpiCard
                label="Profit / Loss"
                icon={<CheckCircle2 size={17} weight="duotone" />}
                value={formatCurr(data.profitLoss)}
                // Sales with no purchase rate contribute nothing to profit, so
                // the figure above is a floor, not the answer. Saying so on the
                // card beats a reader taking it as final.
                note={data.uncostedSales > 0
                  ? `understated - ${formatCurr(data.uncostedSales)} of sales have no purchase rate`
                  : `${profitMargin.toFixed(2)}% margin`}
                valueClassName={data.profitLoss >= 0 ? 'text-navy-900' : 'text-brand-red'}
              />
            </div>
          </section>

          {/* ── SECTION 02 — PERFORMANCE OVERVIEW ───────────────────────── */}
          {/* Outside the two-column grid above, so the chart gets the whole
              content width instead of what is left beside a 300px column. */}
          <section className="overflow-hidden rounded-lg border border-surface-border bg-surface shadow-sm">
            <div className="bg-slate-800 px-4 py-3 text-center">
              <h2 className="text-sm font-black uppercase tracking-[0.28em] text-white">Performance Overview</h2>
            </div>
            <div className="overflow-x-auto px-2 py-6 sm:px-4">
              <div style={{ minWidth: chartInnerWidth }}>
                <ResponsiveContainer width="100%" height={430}>
                  <BarChart data={data.dailyPerformance} margin={{ top: 16, right: 8, left: 4, bottom: 4 }} barCategoryGap="18%" barGap={1}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#D8DEE9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={value => `${Math.round(Number(value) / 1000)}k`} axisLine={false} tickLine={false} width={46} />
                    <Tooltip content={<PerformanceTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 12 }} iconType="circle" iconSize={9} />
                    {/* Palette colours - profit and expense were still on the
                        pre-palette greens and reds. */}
                    <Bar dataKey="target" name="Target" fill={CHART_MUTED} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="sales" name="Sales" fill="#0F1117" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="profit" name="Profit" fill={CHART_GREEN} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expense" name="Expense" fill="#EF4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ── SECTION 03 — MONTHLY PURCHASES & REPORTS ────────────────── */}
          {/* 370px, not more: every pixel this column takes comes out of the
              report table beside it, and past this the table's last column
              stops fitting. */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
            <PurchaseTargetDonut
              title="Monthly Purchases Target"
              target={monthlyPurchaseTotals.target}
              achieved={monthlyPurchaseTotals.achieved}
              rows={data.monthlyPurchaseRows || []}
              emptyNote="No purchase target for this month"
            />

            <div className="min-w-0 overflow-hidden rounded-lg border border-surface-border bg-surface shadow-sm">
              {/* Tabs on the right of the row. */}
              <div className="flex flex-wrap items-center justify-end gap-1 border-b border-slate-200 p-3">
                {REPORT_TABS.map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setReportTab(tab.key)}
                    aria-pressed={tab.key === reportTab}
                    className={
                      tab.key === reportTab
                        ? 'btn-primary !px-3 !py-1.5 !text-xs'
                        : 'rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white/70 hover:text-slate-900'
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="p-3">
                {reportTab === 'sales' && (
                  <ReportBreakdownTable
                    rows={data.salesBreakdown}
                    totalRow={salesTotalRow}
                    minWidth="820px"
                    columns={[
                      { label: 'Product Name', render: row => clippedName(row) },
                      { label: 'Sales QTY', align: 'right', render: row => formatNum(amount(row.qty)) },
                      { label: 'Sales Amount', align: 'right', render: row => formatCurr(row.amount) },
                      { label: 'Cost', align: 'right', render: row => formatCurr(amount(row.cost)) },
                      { label: 'Profit', align: 'right', render: row => formatCurr(amount(row.profit)) },
                      { label: 'Breakdown %', align: 'right', render: row => breakdownText(amount(row.percent)) },
                    ]}
                  />
                )}
                {reportTab === 'purchases' && (
                  <ReportBreakdownTable
                    rows={data.purchaseBreakdown}
                    totalRow={purchaseTotalRow}
                    minWidth="820px"
                    columns={[
                      { label: 'Product Name', render: row => clippedName(row) },
                      { label: 'Purchase QTY', align: 'right', render: row => formatNum(amount(row.qty)) },
                      { label: 'Amount', align: 'right', render: row => formatCurr(row.amount) },
                      { label: 'SP Amount', align: 'right', render: row => formatCurr(amount(row.incentive)) },
                      { label: 'Actual Purchase', align: 'right', render: row => formatCurr(amount(row.actualPurchase)) },
                      { label: 'Breakdown %', align: 'right', render: row => breakdownText(amount(row.percent)) },
                    ]}
                  />
                )}
                {reportTab === 'expenses' && (
                  <ReportBreakdownTable
                    rows={data.expenseBreakdown}
                    totalRow={expenseTotalRow}
                    minWidth="560px"
                    columns={[
                      { label: 'Expense Category', render: row => clippedName(row) },
                      { label: 'Amount', align: 'right', render: row => formatCurr(row.amount) },
                      { label: 'Breakdown %', align: 'right', render: row => breakdownText(amount(row.percent)) },
                    ]}
                  />
                )}
                {reportTab === 'supplier' && (
                  <ReportBreakdownTable
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
                )}
                {reportTab === 'otherIncome' && (
                  <ReportBreakdownTable
                    rows={data.otherIncomeBreakdown}
                    totalRow={otherIncomeTotalRow}
                    minWidth="640px"
                    columns={[
                      { label: 'Supplier / Source', render: row => clippedName(row) },
                      { label: 'Type', align: 'right', render: row => row.type || <NoValue /> },
                      { label: 'Amount', align: 'right', render: row => formatCurr(row.amount) },
                      { label: 'Breakdown %', align: 'right', render: row => breakdownText(amount(row.percent)) },
                    ]}
                  />
                )}
              </div>
            </div>
          </section>

          <div className="text-right text-xs text-slate-400">
            Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <NoValue />}
          </div>
        </div>
      )}
    </div>
  )
}
