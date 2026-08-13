import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TruckIcon as Truck, ShoppingBagIcon as ShoppingBag, ChartLineUpIcon as ChartLineUp, ReceiptIcon as Receipt, VaultIcon as Vault, HandCoinsIcon as HandCoins, ArrowUpRightIcon as ArrowUpRight, ChartBarIcon as BarChart3, CalendarDotsIcon as CalendarDays, ClipboardTextIcon as ClipboardList, ShoppingCartSimpleIcon as ShoppingCart, TrendUpIcon as TrendingUp, WalletIcon as Wallet } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { readPageCache, writePageCache } from '../lib/pageCache'
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type RangeType = 'thisMonth' | 'today' | 'last7' | 'lastMonth' | 'custom'

type DashboardData = {
  totalSales: number
  totalProfit: number
  totalPurchases: number
  totalExpenses: number
  totalOtherIncome: number
  supplierPayments: number
  dueCollections: number
  totalDiscountAllowed: number
  totalCustomers: number
  netProfit: number
  previous: {
    totalSales: number
    totalProfit: number
    totalPurchases: number
    totalExpenses: number
    totalOtherIncome: number
    supplierPayments: number
    dueCollections: number
    totalDiscountAllowed: number
    totalCustomers: number
    netProfit: number
  }
  monthlySales: { monthIndex: number; sales: number; profit: number }[]
  // Money in against money out, by month. Both sides come from figures already
  // fetched for the cards, so this costs no extra request.
  monthlyCashflow: { monthIndex: number; moneyIn: number; moneyOut: number }[]
  // Both sides of the money, split by month, for the Monthly Spendings card:
  // its tabs switch between them and its picker switches month.
  monthlyBreakdown: {
    key: string
    monthIndex: number
    year: string
    income: { name: string; amount: number }[]
    expenses: { name: string; amount: number }[]
    incomeTotal: number
    expenseTotal: number
  }[]
  topCustomers: { name: string; totalSales: number; dueAmount: number }[]
  recentTransactions: { id: string; title: string; ref: string; amount: number; date: string; tone: CardTone }[]
  dueCollectionRows: { id: string; customerName: string; amount: number; date: string; accountName: string }[]
}

type CardTone = 'green' | 'blue' | 'orange' | 'purple' | 'red'

const rangeOptions: { value: RangeType; label: string }[] = [
  { value: 'thisMonth', label: 'This Month' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'custom', label: 'Custom date to date' },
]

const emptyMetrics = {
  totalSales: 0,
  totalProfit: 0,
  totalPurchases: 0,
  totalExpenses: 0,
  totalOtherIncome: 0,
  supplierPayments: 0,
  dueCollections: 0,
  totalDiscountAllowed: 0,
  totalCustomers: 0,
  netProfit: 0,
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getRange(type: RangeType, customStart: string, customEnd: string) {
  const today = new Date()
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)

  if (type === 'today') return { start: toDateInputValue(today), end: toDateInputValue(today) }
  if (type === 'last7') return { start: toDateInputValue(addDays(today, -6)), end: toDateInputValue(today) }
  if (type === 'lastMonth') return { start: toDateInputValue(lastMonthStart), end: toDateInputValue(lastMonthEnd) }
  if (type === 'custom') {
    return {
      start: customStart || toDateInputValue(currentMonthStart),
      end: customEnd || toDateInputValue(today),
    }
  }

  return { start: toDateInputValue(currentMonthStart), end: toDateInputValue(today) }
}

function getPreviousRange(range: { start: string; end: string }) {
  const start = new Date(range.start)
  const end = new Date(range.end)
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const previousEnd = addDays(start, -1)
  const previousStart = addDays(previousEnd, -(days - 1))

  return { start: toDateInputValue(previousStart), end: toDateInputValue(previousEnd) }
}

function getSaleProfit(sale: any) {
  const items = sale.sale_items || []
  return items.reduce((sum: number, item: any) => {
    const costPrice = Number(item.cost_price || 0)
    if (costPrice <= 0) return sum
    return sum + (Number(item.actual_price || 0) - costPrice) * Number(item.qty || 0)
  }, 0)
}

function getSaleAmount(sale: any) {
  const items = sale.sale_items || []
  const itemGrossTotal = items.reduce((sum: number, item: any) =>
    sum + Number(item.selling_price || 0) * Number(item.qty || 0), 0)
  const gross = itemGrossTotal || Number(sale.subtotal || sale.net_amount || 0)
  const discount = Number(sale.discount_amount || 0)
  return Math.max(0, gross - discount)
}

function parseMetaValue(notes: string, label: string) {
  const line = String(notes || '').split('\n').find(item => item.toLowerCase().startsWith(`${label.toLowerCase()}:`))
  return line ? line.slice(label.length + 1).trim() : ''
}

function parseAmountText(value: string) {
  return Number(String(value || '').replace(/[^\d.-]/g, '')) || 0
}

function pctChange(current: number, previous: number) {
  if (!previous && !current) return 0
  if (!previous) return current > 0 ? 100 : 0
  return ((current - previous) / Math.abs(previous)) * 100
}

const dashboardCacheKey = (rangeType: RangeType, customStart: string, customEnd: string) =>
  `dashboard:${rangeType}:${customStart}:${customEnd}`

const emptyDashboardData: DashboardData = {
  ...emptyMetrics,
  previous: emptyMetrics,
  monthlySales: [],
  monthlyCashflow: [],
  monthlyBreakdown: [],
  topCustomers: [],
  recentTransactions: [],
  dueCollectionRows: [],
}

export default function Dashboard() {
  const { t, formatCurr, formatDateShort, monthShort } = useLang()
  const { touchOwnerActivity, profile, user } = useAuth()
  const ownerName = profile?.full_name?.trim() || user?.email || 'Owner'
  const navigate = useNavigate()
  // Paint the last-known dashboard for the default range instantly; only show
  // the spinner when there's nothing cached yet. loadDashboard() refetches.
  const initialCached = readPageCache<DashboardData>(dashboardCacheKey('thisMonth', '', ''))
  const [data, setData] = useState<DashboardData>(initialCached || emptyDashboardData)
  const [loading, setLoading] = useState(!initialCached)
  const [rangeType, setRangeType] = useState<RangeType>('thisMonth')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Month names are applied at render, not at fetch, so switching language
  // renames every axis and picker immediately - and the cached data stays
  // language-agnostic instead of freezing whichever language loaded it.
  const salesSeries = useMemo(
    () => data.monthlySales.map(row => ({ ...row, month: monthShort(row.monthIndex) })),
    [data.monthlySales, monthShort]
  )
  const cashflowSeries = useMemo(
    () => data.monthlyCashflow.map(row => ({ ...row, month: monthShort(row.monthIndex) })),
    [data.monthlyCashflow, monthShort]
  )
  const breakdownMonths = useMemo(
    () => data.monthlyBreakdown.map(row => ({ ...row, label: `${monthShort(row.monthIndex)} ${row.year}` })),
    [data.monthlyBreakdown, monthShort]
  )

  const range = getRange(rangeType, customStart, customEnd)
  const dateRangeText = `${formatDateShort(range.start)} - ${formatDateShort(range.end)}`

  useEffect(() => { loadDashboard() }, [rangeType, customStart, customEnd])

  async function loadDashboard() {
    touchOwnerActivity()
    // Show cached data for this exact range immediately (no spinner); only
    // spin when this range has never been loaded on this device.
    const cacheKey = dashboardCacheKey(rangeType, customStart, customEnd)
    const cached = readPageCache<DashboardData>(cacheKey)
    if (cached) {
      setData(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    const selectedRange = getRange(rangeType, customStart, customEnd)
    const previousRange = getPreviousRange(selectedRange)

    const [
      salesRes,
      previousSalesRes,
      expensesRes,
      previousExpensesRes,
      purchasesRes,
      previousPurchasesRes,
      supplierPaymentsRes,
      previousSupplierPaymentsRes,
      otherIncomeRes,
      previousOtherIncomeRes,
      recentOtherIncomeRes,
      dueCollectionsRes,
      previousDueCollectionsRes,
      customersRes,
      recentPurchasesRes,
      recentExpensesRes,
    ] = await Promise.all([
      supabase.from('sales').select('id, invoice_no, date, customer_name, subtotal, discount_amount, net_amount, due_amount, sale_items(selling_price, actual_price, cost_price, qty)').eq('status', 'completed').gte('date', selectedRange.start).lte('date', selectedRange.end),
      supabase.from('sales').select('id, date, customer_name, subtotal, discount_amount, net_amount, due_amount, sale_items(selling_price, actual_price, cost_price, qty)').eq('status', 'completed').gte('date', previousRange.start).lte('date', previousRange.end),
      supabase.from('expenses').select('id, date, category_name, amount').gte('date', selectedRange.start).lte('date', selectedRange.end),
      supabase.from('expenses').select('amount').gte('date', previousRange.start).lte('date', previousRange.end),
      supabase.from('purchases').select('id, si_no, date, supplier_name, net_amount').gte('date', selectedRange.start).lte('date', selectedRange.end),
      supabase.from('purchases').select('net_amount').gte('date', previousRange.start).lte('date', previousRange.end),
      supabase.from('supplier_payments').select('id, date, supplier_name, amount').gte('date', selectedRange.start).lte('date', selectedRange.end),
      supabase.from('supplier_payments').select('amount').gte('date', previousRange.start).lte('date', previousRange.end),
      supabase.from('other_incomes').select('id, date, income_type, supplier_name, source_name, amount').gte('date', selectedRange.start).lte('date', selectedRange.end),
      supabase.from('other_incomes').select('amount').gte('date', previousRange.start).lte('date', previousRange.end),
      supabase.from('other_incomes').select('id, date, income_type, supplier_name, source_name, amount').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(6),
      supabase.from('customer_payments').select('id, date, customer_name, amount, account_name, notes').gte('date', selectedRange.start).lte('date', selectedRange.end).order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('customer_payments').select('amount, notes').gte('date', previousRange.start).lte('date', previousRange.end),
      supabase.from('customers').select('id', { count: 'exact' }),
      supabase.from('purchases').select('id, si_no, date, supplier_name, net_amount').order('date', { ascending: false }).limit(6),
      supabase.from('expenses').select('id, date, category_name, amount').order('date', { ascending: false }).limit(6),
    ])

    const sales = salesRes.data || []
    const previousSales = previousSalesRes.data || []
    const expenses = expensesRes.data || []
    const purchases = purchasesRes.data || []
    const supplierPayments = supplierPaymentsRes.data || []
    const otherIncomes = otherIncomeRes.data || []
    const dueCollections = dueCollectionsRes.data || []

    const totalSales = sales.reduce((sum: number, sale: any) => sum + getSaleAmount(sale), 0)
    const totalProfit = sales.reduce((sum: number, sale: any) => sum + getSaleProfit(sale), 0)
    const totalPurchases = purchases.reduce((sum: number, purchase: any) => sum + Number(purchase.net_amount || 0), 0)
    const totalExpenses = expenses.reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0)
    const totalOtherIncome = otherIncomes.reduce((sum: number, income: any) => sum + Number(income.amount || 0), 0)
    const supplierPaymentTotal = supplierPayments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
    const dueCollectionTotal = dueCollections.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
    const invoiceDiscountTotal = sales.reduce((sum: number, sale: any) => sum + Number(sale.discount_amount || 0), 0)
    const dueDiscountTotal = dueCollections.reduce((sum: number, payment: any) =>
      sum + parseAmountText(parseMetaValue(payment.notes || '', 'Discount Amount')), 0)
    const totalDiscountAllowed = invoiceDiscountTotal + dueDiscountTotal

    const previousTotalSales = previousSales.reduce((sum: number, sale: any) => sum + getSaleAmount(sale), 0)
    const previousTotalProfit = previousSales.reduce((sum: number, sale: any) => sum + getSaleProfit(sale), 0)
    const previousTotalPurchases = (previousPurchasesRes.data || []).reduce((sum: number, purchase: any) => sum + Number(purchase.net_amount || 0), 0)
    const previousTotalExpenses = (previousExpensesRes.data || []).reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0)
    const previousTotalOtherIncome = (previousOtherIncomeRes.data || []).reduce((sum: number, income: any) => sum + Number(income.amount || 0), 0)
    const previousSupplierPayments = (previousSupplierPaymentsRes.data || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
    const previousDueCollections = (previousDueCollectionsRes.data || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
    const previousInvoiceDiscountTotal = previousSales.reduce((sum: number, sale: any) => sum + Number(sale.discount_amount || 0), 0)
    const previousDueDiscountTotal = (previousDueCollectionsRes.data || []).reduce((sum: number, payment: any) =>
      sum + parseAmountText(parseMetaValue(payment.notes || '', 'Discount Amount')), 0)
    const previousTotalDiscountAllowed = previousInvoiceDiscountTotal + previousDueDiscountTotal

    const monthlyMap: Record<number, { sales: number; profit: number }> = {}
    sales.forEach((sale: any) => {
      const month = new Date(sale.date).getMonth() + 1
      if (!monthlyMap[month]) monthlyMap[month] = { sales: 0, profit: 0 }
      monthlyMap[month].sales += getSaleAmount(sale)
      monthlyMap[month].profit += getSaleProfit(sale)
    })
    otherIncomes.forEach((income: any) => {
      const month = new Date(income.date).getMonth() + 1
      if (!monthlyMap[month]) monthlyMap[month] = { sales: 0, profit: 0 }
      monthlyMap[month].profit += Number(income.amount || 0)
    })

    // Cashflow: what came in against what went out, month by month. The same
    // rows the cards are counted from, bucketed by month instead of summed.
    const cashflowMap: Record<number, { moneyIn: number; moneyOut: number }> = {}
    const bucket = (dateStr: string) => {
      const month = new Date(dateStr).getMonth() + 1
      if (!cashflowMap[month]) cashflowMap[month] = { moneyIn: 0, moneyOut: 0 }
      return cashflowMap[month]
    }
    sales.forEach((sale: any) => { bucket(sale.date).moneyIn += getSaleAmount(sale) })
    otherIncomes.forEach((income: any) => { bucket(income.date).moneyIn += Number(income.amount || 0) })
    ;(dueCollectionsRes.data || []).forEach((payment: any) => { bucket(payment.date).moneyIn += Number(payment.amount || 0) })
    ;(purchasesRes.data || []).forEach((purchase: any) => { bucket(purchase.date).moneyOut += Number(purchase.net_amount || 0) })
    ;(expensesRes.data || []).forEach((expense: any) => { bucket(expense.date).moneyOut += Number(expense.amount || 0) })
    ;(supplierPaymentsRes.data || []).forEach((payment: any) => { bucket(payment.date).moneyOut += Number(payment.amount || 0) })

    // Money in and money out by month, each broken down by where it came from
    // or went. Expenses carry their own category; income is grouped by the
    // three things that bring money in.
    const breakdownMap: Record<string, { income: Record<string, number>; expenses: Record<string, number> }> = {}
    const monthKey = (dateStr: string) => {
      const date = new Date(dateStr)
      if (Number.isNaN(date.getTime())) return null
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }
    const addTo = (side: 'income' | 'expenses', dateStr: string, name: string, amount: number) => {
      const key = monthKey(dateStr)
      if (!key || !amount) return
      if (!breakdownMap[key]) breakdownMap[key] = { income: {}, expenses: {} }
      breakdownMap[key][side][name] = (breakdownMap[key][side][name] || 0) + amount
    }
    // Income is what the business earned. Due collections are cash arriving
    // against sales already counted here, so including them would report the
    // same money twice.
    sales.forEach((sale: any) => addTo('income', sale.date, 'Sales', getSaleAmount(sale)))
    otherIncomes.forEach((income: any) => addTo('income', income.date, 'Other Income', Number(income.amount || 0)))
    // Expenses means the same thing here as on the Total Expenses card above -
    // the expense records, nothing else. Purchases and supplier payments are
    // money out, but they are stock and settlements, and showing them under
    // the same word would put two different figures called "expenses" on one
    // screen. Cashflow, which is about money moving, does count them.
    ;(expensesRes.data || []).forEach((expense: any) =>
      addTo('expenses', expense.date, String(expense.category_name || '').trim() || 'Uncategorised', Number(expense.amount || 0)))

    const sortRows = (rows: Record<string, number>) =>
      Object.entries(rows).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)

    const monthlyBreakdown = Object.keys(breakdownMap).sort().reverse().map(key => {
      const income = sortRows(breakdownMap[key].income)
      const expenses = sortRows(breakdownMap[key].expenses)
      const [year, month] = key.split('-')
      return {
        key,
        monthIndex: Number(month),
        year,
        income,
        expenses,
        incomeTotal: income.reduce((sum, row) => sum + row.amount, 0),
        expenseTotal: expenses.reduce((sum, row) => sum + row.amount, 0),
      }
    })

    const customerMap: Record<string, { name: string; totalSales: number; dueAmount: number }> = {}
    sales.forEach((sale: any) => {
      const key = sale.customer_name || 'Walk In Customer'
      if (!customerMap[key]) customerMap[key] = { name: key, totalSales: 0, dueAmount: 0 }
      customerMap[key].totalSales += getSaleAmount(sale)
      customerMap[key].dueAmount += Number(sale.due_amount || 0)
    })

    const recentSales = sales.slice(0, 6).map((sale: any) => ({
      id: `sale-${sale.id}`,
      title: 'New Sale',
      ref: sale.invoice_no || sale.customer_name || '-',
      amount: getSaleAmount(sale),
      date: sale.date,
      tone: 'green' as CardTone,
    }))
    const recentPurchases = (recentPurchasesRes.data || []).map((purchase: any) => ({
      id: `purchase-${purchase.id}`,
      title: 'New Purchase',
      ref: purchase.si_no || purchase.supplier_name || '-',
      amount: Number(purchase.net_amount || 0),
      date: purchase.date,
      tone: 'blue' as CardTone,
    }))
    const recentExpenses = (recentExpensesRes.data || []).map((expense: any) => ({
      id: `expense-${expense.id}`,
      title: 'Expense Added',
      ref: expense.category_name || '-',
      amount: Number(expense.amount || 0),
      date: expense.date,
      tone: 'orange' as CardTone,
    }))
    const recentSupplierPayments = supplierPayments.slice(0, 6).map((payment: any) => ({
      id: `supplier-${payment.id}`,
      title: 'Supplier Payment',
      ref: payment.supplier_name || '-',
      amount: Number(payment.amount || 0),
      date: payment.date,
      tone: 'purple' as CardTone,
    }))
    const recentOtherIncome = (recentOtherIncomeRes.data || []).map((income: any) => ({
      id: `other-income-${income.id}`,
      title: 'Other Income',
      ref: income.income_type === 'supplier' ? income.supplier_name || '-' : income.source_name || '-',
      amount: Number(income.amount || 0),
      date: income.date,
      tone: 'green' as CardTone,
    }))
    const profitWithOtherIncome = totalProfit + totalOtherIncome
    const previousProfitWithOtherIncome = previousTotalProfit + previousTotalOtherIncome

    const nextData: DashboardData = {
      totalSales,
      totalProfit: profitWithOtherIncome,
      totalPurchases,
      totalExpenses,
      totalOtherIncome,
      supplierPayments: supplierPaymentTotal,
      dueCollections: dueCollectionTotal,
      totalDiscountAllowed,
      totalCustomers: customersRes.count || 0,
      netProfit: profitWithOtherIncome - totalExpenses,
      previous: {
        totalSales: previousTotalSales,
        totalProfit: previousProfitWithOtherIncome,
        totalPurchases: previousTotalPurchases,
        totalExpenses: previousTotalExpenses,
        totalOtherIncome: previousTotalOtherIncome,
        supplierPayments: previousSupplierPayments,
        dueCollections: previousDueCollections,
        totalDiscountAllowed: previousTotalDiscountAllowed,
        totalCustomers: customersRes.count || 0,
        netProfit: previousProfitWithOtherIncome - previousTotalExpenses,
      },
      monthlySales: Array.from({ length: 12 }, (_, i) => ({
        monthIndex: i + 1,
        sales: monthlyMap[i + 1]?.sales || 0,
        profit: monthlyMap[i + 1]?.profit || 0,
      })),
      monthlyCashflow: Array.from({ length: 12 }, (_, i) => ({
        monthIndex: i + 1,
        moneyIn: cashflowMap[i + 1]?.moneyIn || 0,
        moneyOut: cashflowMap[i + 1]?.moneyOut || 0,
      })),
      monthlyBreakdown,
      topCustomers: Object.values(customerMap).sort((a, b) => b.totalSales - a.totalSales).slice(0, 10),
      recentTransactions: [...recentSales, ...recentPurchases, ...recentExpenses, ...recentSupplierPayments, ...recentOtherIncome]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6),
      dueCollectionRows: dueCollections.slice(0, 10).map((payment: any) => ({
        id: payment.id,
        customerName: payment.customer_name || '-',
        amount: Number(payment.amount || 0),
        date: payment.date,
        accountName: payment.account_name || '-',
      })),
    }
    setData(nextData)
    writePageCache(cacheKey, nextData)
    setLoading(false)
  }


  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
    </div>
  )

  return (
    <div className="min-h-full p-6">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">
            {t('dashboard_welcome', 'Welcome Back')}, {ownerName}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t('dashboard_welcomeSub', 'Everything you need to manage your business.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <select
            className="input h-9 w-40 text-xs font-semibold"
            value={rangeType}
            onChange={e => setRangeType(e.target.value as RangeType)}
            aria-label="Dashboard date range"
          >
            {rangeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600">
            <span>{dateRangeText}</span>
            <CalendarDays size={14} className="text-slate-400" />
          </div>
          {rangeType === 'custom' && (
            <>
              <input type="date" className="input h-9 w-36 text-xs" value={range.start} onChange={e => setCustomStart(e.target.value)} />
              <input type="date" className="input h-9 w-36 text-xs" value={range.end} min={range.start} onChange={e => setCustomEnd(e.target.value)} />
            </>
          )}
        </div>
      </div>


      {/* Row 1 - the headline, the four figures, and where the money moved. */}
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
        <HeroCard
          label="Net Profit"
          value={formatCurr(data.netProfit)}
          trend={pctChange(data.netProfit, data.previous.netProfit)}
          onWithdraw={() => navigate("/transactions/profit")}
          onSavings={() => navigate("/balance")}
        />

        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Total Purchase" icon={<Truck size={17} weight="duotone" />} value={formatCurr(data.totalPurchases)} trend={pctChange(data.totalPurchases, data.previous.totalPurchases)} inverted />
          <StatCard label="Total Sales" icon={<ShoppingBag size={17} weight="duotone" />} value={formatCurr(data.totalSales)} trend={pctChange(data.totalSales, data.previous.totalSales)} />
          <StatCard label="Total Profit" icon={<ChartLineUp size={17} weight="duotone" />} value={formatCurr(data.totalProfit)} trend={pctChange(data.totalProfit, data.previous.totalProfit)} />
          <StatCard label="Total Expenses" icon={<Receipt size={17} weight="duotone" />} value={formatCurr(data.totalExpenses)} trend={pctChange(data.totalExpenses, data.previous.totalExpenses)} inverted />
        </div>

        <section className="card border-navy-900 bg-navy-900 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">Cashflow</h2>
              <p className="text-xs text-white/50">Money in against money out</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5 text-white/70"><i className="h-2 w-2 rounded-full bg-brand-green" /> In</span>
              <span className="flex items-center gap-1.5 text-white/70"><i className="h-2 w-2 rounded-full bg-brand-red" /> Out</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={cashflowSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff14" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#ffffff80" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#ffffff80" }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip
                cursor={{ stroke: "#ffffff33" }}
                contentStyle={{ background: "#0F1117", border: "1px solid #ffffff1a", borderRadius: 12, fontSize: 12, color: "#fff" }}
                formatter={(value: any) => formatCurr(Number(value))}
              />
              <Line type="monotone" dataKey="moneyIn" name="In" stroke="#22C55E" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="moneyOut" name="Out" stroke="#EF4444" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </div>

      {/* Row 2 - where it was spent, purchases against sales, best customers. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1.2fr)]">
        <MonthlySpendings months={breakdownMonths} formatCurr={formatCurr} />

        <section className="card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-navy-900">Purchase & Sales</h2>
              <p className="text-xs text-neutral-500">Month by month</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold text-neutral-500">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-navy-900" /> Sales</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand-green" /> Profit</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={salesSeries} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip
                cursor={{ fill: "#F3F4F6" }}
                contentStyle={{ border: "1px solid #E5E7EB", borderRadius: 12, fontSize: 12 }}
                formatter={(value: any) => formatCurr(Number(value))}
              />
              <Bar dataKey="sales" name="Sales" fill="#0F1117" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" name="Profit" fill="#22C55E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 p-5 pb-3">
            <div>
              <h2 className="text-sm font-bold text-navy-900">Top Customers</h2>
              <p className="text-xs text-neutral-500">By sales this period</p>
            </div>
            <Link to="/customers" className="btn-secondary h-8 px-3 text-xs">View all</Link>
          </div>
          <div className="max-h-[250px] overflow-y-auto px-5 pb-5">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="py-2 text-left">Customer</th>
                  <th className="py-2 text-right">Sales</th>
                  <th className="py-2 text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {data.topCustomers.length === 0 && (
                  <tr><td colSpan={3} className="py-10 text-center text-neutral-500">No customers yet</td></tr>
                )}
                {data.topCustomers.map((customer, index) => (
                  <tr key={`${customer.name}-${index}`} className="border-t border-neutral-200">
                    <td className="py-2.5 font-medium text-navy-900">{customer.name}</td>
                    <td className="py-2.5 text-right tabular-nums text-neutral-700">{formatCurr(customer.totalSales)}</td>
                    <td className={`py-2.5 text-right tabular-nums font-semibold ${customer.dueAmount > 0 ? "text-brand-red" : "text-neutral-500"}`}>{formatCurr(customer.dueAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}


// A trend that says "+100.0%" because last period was zero tells the reader
// nothing, so it is only drawn when there is a real previous figure to compare
// against.
function TrendLine({ trend, inverted = false }: { trend: number; inverted?: boolean }) {
  // A trend of exactly 100% means last period was zero, which compares
  // nothing; showing it on almost every card taught the eye to skip the line.
  if (!Number.isFinite(trend) || Math.abs(trend) < 0.05 || Math.abs(trend) === 100) return null
  const good = inverted ? trend <= 0 : trend >= 0
  return (
    <span className={`text-xs font-semibold ${good ? "text-brand-green" : "text-brand-red"}`}>
      {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(2)}%
    </span>
  )
}

// The one figure the owner is looking for. The sweep across the black is two
// soft light streaks laid over the gradient - the flat two-stop version read
// as a grey rectangle next to the white cards.
function HeroCard({ label, value, trend, onWithdraw, onSavings }: {
  label: string; value: string; trend: number; onWithdraw: () => void; onSavings: () => void
}) {
  return (
    <section
      className="relative flex min-h-[248px] flex-col justify-between overflow-hidden rounded-2xl p-6 text-white"
      style={{
        backgroundColor: "#0F1117",
        backgroundImage: [
          "linear-gradient(118deg, rgba(255,255,255,0.16) 8%, rgba(255,255,255,0) 34%)",
          "linear-gradient(122deg, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0) 58%)",
          "linear-gradient(135deg, #0F1117 0%, #1b1f28 55%, #2A2D34 100%)",
        ].join(", "),
      }}
    >
      <div>
        <p className="text-sm font-medium text-white/70">{label}</p>
        {/* A loss reads red here too, the same rule the reports follow. */}
        <p className={`mt-4 text-[42px] font-medium tracking-tight tabular-nums leading-none ${value.includes("-") ? "text-brand-red" : "text-white"}`}>
          {value}
        </p>
        <div className="mt-2 h-4"><TrendLine trend={trend} /></div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onWithdraw}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-white/90"
        >
          <HandCoins size={17} weight="duotone" /> Withdraw
        </button>
        <button
          type="button"
          onClick={onSavings}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          <Vault size={17} weight="duotone" /> Savings
        </button>
      </div>
    </section>
  )
}

// Icon in its own outlined square with the label beside it, the figure large
// below, and the change under that - nothing else. Anything more competed
// with the number the card exists to show.
function StatCard({ label, icon, value, trend, inverted = false }: {
  label: string; icon: React.ReactNode; value: string; trend: number; inverted?: boolean
}) {
  return (
    <section className="card flex min-h-[124px] flex-col justify-between p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-surface-border bg-white text-neutral-700">
          {icon}
        </span>
        <span className="truncate text-sm text-neutral-700">{label}</span>
      </div>
      <p className="mt-5 text-2xl font-medium tracking-tight tabular-nums leading-none text-navy-900">{value}</p>
      <div className="mt-2 h-4"><TrendLine trend={trend} inverted={inverted} /></div>
    </section>
  )
}

// Slice colours are a grey ramp with the largest share in near-black, so the
// chart stays inside the palette.
const donutFills = ["#0F1117", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB", "#E5E7EB"]

type BreakdownMonth = {
  key: string
  label: string
  income: { name: string; amount: number }[]
  expenses: { name: string; amount: number }[]
  incomeTotal: number
  expenseTotal: number
}

function MonthlySpendings({ months, formatCurr }: {
  months: BreakdownMonth[]; formatCurr: (value: number) => string
}) {
  const [monthKey, setMonthKey] = useState("")
  const [side, setSide] = useState<"income" | "expenses">("expenses")

  // The picker can only offer months the loaded data actually covers, so the
  // newest of those is the sensible default and it has to follow the range
  // selector at the top of the page.
  const active = months.find(month => month.key === monthKey) || months[0]

  if (!active) {
    return (
      <section className="card">
        <h2 className="text-sm font-bold text-navy-900">Monthly Spendings</h2>
        <div className="flex h-[250px] items-center justify-center text-sm text-neutral-500">Nothing in this period</div>
      </section>
    )
  }

  const rows = side === "income" ? active.income : active.expenses
  const total = side === "income" ? active.incomeTotal : active.expenseTotal

  // Past the fifth entry everything is one "Other" slice, or the legend runs
  // longer than the chart explaining it.
  const top = rows.slice(0, 5)
  const rest = rows.slice(5).reduce((sum, row) => sum + row.amount, 0)
  const slices = rest > 0 ? [...top, { name: "Other", amount: rest }] : top

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy-900">Monthly Spendings</h2>
        <select
          className="input h-8 w-auto rounded-full py-0 text-xs font-semibold"
          value={active.key}
          onChange={event => setMonthKey(event.target.value)}
          aria-label="Month"
        >
          {months.map(month => <option key={month.key} value={month.key}>{month.label}</option>)}
        </select>
      </div>

      <div className="mb-3 flex border-b border-neutral-200 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setSide("income")}
          className={`-mb-px border-b-2 px-3 pb-2 transition-colors ${side === "income" ? "border-navy-900 text-navy-900" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}
        >
          Income ({formatCurr(active.incomeTotal)})
        </button>
        <button
          type="button"
          onClick={() => setSide("expenses")}
          className={`-mb-px border-b-2 px-3 pb-2 transition-colors ${side === "expenses" ? "border-navy-900 text-navy-900" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}
        >
          Expenses ({formatCurr(active.expenseTotal)})
        </button>
      </div>

      {slices.length === 0 ? (
        <div className="flex h-[210px] items-center justify-center text-sm text-neutral-500">
          No {side} in {active.label}
        </div>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={slices} dataKey="amount" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                  {slices.map((slice, index) => <Cell key={slice.name} fill={donutFills[index % donutFills.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ border: "1px solid #E5E7EB", borderRadius: 12, fontSize: 12 }} formatter={(value: any) => formatCurr(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-lg font-bold tabular-nums text-navy-900">{formatCurr(total)}</p>
              <p className="text-[11px] text-neutral-500">Total {side}</p>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {slices.map((slice, index) => (
              <li key={slice.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: donutFills[index % donutFills.length] }} />
                  <span className="truncate text-neutral-700">{slice.name}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-navy-900">{formatCurr(slice.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
