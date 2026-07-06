import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  ShoppingCart,
  Target,
  Tag,
  TrendingUp,
  Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import {
  Bar,
  BarChart,
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
  monthlySales: { month: string; sales: number; profit: number }[]
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

const toneClasses: Record<CardTone, { icon: string; soft: string; text: string; fill: string }> = {
  green: { icon: 'bg-green-50 text-brand-green', soft: 'bg-green-50', text: 'text-brand-green', fill: '#22c55e' },
  blue: { icon: 'bg-blue-50 text-blue-600', soft: 'bg-blue-50', text: 'text-blue-600', fill: '#2563eb' },
  orange: { icon: 'bg-orange-50 text-orange-600', soft: 'bg-orange-50', text: 'text-orange-600', fill: '#f97316' },
  purple: { icon: 'bg-purple-50 text-purple-600', soft: 'bg-purple-50', text: 'text-purple-600', fill: '#9333ea' },
  red: { icon: 'bg-red-50 text-brand-red', soft: 'bg-red-50', text: 'text-brand-red', fill: '#ef4444' },
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

export default function Dashboard() {
  const { t, formatCurr, formatDateLong, formatDateShort, monthShort } = useLang()
  const { touchOwnerActivity } = useAuth()
  const [data, setData] = useState<DashboardData>({
    ...emptyMetrics,
    previous: emptyMetrics,
    monthlySales: [],
    topCustomers: [],
    recentTransactions: [],
    dueCollectionRows: [],
  })
  const [loading, setLoading] = useState(true)
  const [rangeType, setRangeType] = useState<RangeType>('thisMonth')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const currentYear = new Date().getFullYear()
  const range = getRange(rangeType, customStart, customEnd)
  const dateRangeText = `${formatDateShort(range.start)} - ${formatDateShort(range.end)}`

  useEffect(() => { loadDashboard() }, [rangeType, customStart, customEnd])

  async function loadDashboard() {
    touchOwnerActivity()
    setLoading(true)
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

    setData({
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
        month: monthShort(i + 1),
        sales: monthlyMap[i + 1]?.sales || 0,
        profit: monthlyMap[i + 1]?.profit || 0,
      })),
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
    })
    setLoading(false)
  }

  const summaryTotal = Math.max(1, data.totalSales + data.totalPurchases + data.totalExpenses + data.totalOtherIncome + data.supplierPayments + data.dueCollections)
  const summaryData = [
    { name: 'Sales', value: data.totalSales, color: toneClasses.green.fill },
    { name: 'Purchase', value: data.totalPurchases, color: toneClasses.blue.fill },
    { name: 'Expenses', value: data.totalExpenses, color: toneClasses.orange.fill },
    { name: 'Other Income', value: data.totalOtherIncome, color: toneClasses.green.fill },
    { name: 'Supplier Payments', value: data.supplierPayments, color: toneClasses.purple.fill },
    { name: 'Due Collections', value: data.dueCollections, color: toneClasses.green.fill },
  ]

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-green border-t-transparent" />
    </div>
  )

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('dashboard_title')}</h1>
          <p className="mt-1 text-sm text-slate-500">Overview of your business performance</p>
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

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Total Sales" value={formatCurr(data.totalSales)} icon={<TrendingUp size={22} />} tone="green" trend={pctChange(data.totalSales, data.previous.totalSales)} />
        <MetricCard title="Total Profit" value={formatCurr(data.totalProfit)} icon={<BarChart3 size={22} />} tone="green" trend={pctChange(data.totalProfit, data.previous.totalProfit)} />
        <MetricCard title="Total Purchase" value={formatCurr(data.totalPurchases)} icon={<ShoppingCart size={22} />} tone="blue" trend={pctChange(data.totalPurchases, data.previous.totalPurchases)} inverted />
        <MetricCard title="Total Expenses" value={formatCurr(data.totalExpenses)} icon={<ClipboardList size={22} />} tone="orange" trend={pctChange(data.totalExpenses, data.previous.totalExpenses)} inverted />
        <MetricCard title="Other Income" value={formatCurr(data.totalOtherIncome)} icon={<CreditCard size={22} />} tone="green" trend={pctChange(data.totalOtherIncome, data.previous.totalOtherIncome)} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <MetricCard title="Supplier Payments" value={formatCurr(data.supplierPayments)} icon={<CreditCard size={22} />} tone="purple" trend={pctChange(data.supplierPayments, data.previous.supplierPayments)} inverted />
        <MetricCard title="Due Collections" value={formatCurr(data.dueCollections)} icon={<CreditCard size={22} />} tone="purple" trend={pctChange(data.dueCollections, data.previous.dueCollections)} />
        <MetricCard title="Total Discount Allowed" value={formatCurr(data.totalDiscountAllowed)} icon={<Tag size={22} />} tone="orange" trend={pctChange(data.totalDiscountAllowed, data.previous.totalDiscountAllowed)} inverted />
        <MetricCard title="Net Profit (Profit + Other Income - Expenses)" value={formatCurr(data.netProfit)} icon={<Target size={22} />} tone="green" trend={pctChange(data.netProfit, data.previous.netProfit)} wide />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <section className="card xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-800">Sales & Profit Overview</h2>
              <div className="mt-3 flex items-center gap-5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-3 rounded-sm bg-green-500" />Sales</span>
                <span className="inline-flex items-center gap-2"><span className="h-2 w-3 rounded-sm bg-blue-600" />Profit</span>
              </div>
            </div>
            <select className="input h-9 w-32 text-xs" value="monthly" aria-label="Chart interval" onChange={() => undefined}>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.monthlySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => formatCurr(v)} />
              <Bar dataKey="sales" fill="#22c55e" radius={[5, 5, 0, 0]} name="Sales" />
              <Bar dataKey="profit" fill="#2563eb" radius={[5, 5, 0, 0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Top 10 Customers</h2>
            <Link to="/customers/dashboard" className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600">View All</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Customer Name</th>
                  <th className="px-3 py-2 text-right">Total Sales</th>
                  <th className="px-3 py-2 text-right">Due Amount</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }, (_, index) => data.topCustomers[index]).map((customer, index) => (
                  <tr key={`${customer?.name || 'empty'}-${index}`} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{customer?.name || '-'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurr(customer?.totalSales || 0)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurr(customer?.dueAmount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card">
          <h2 className="mb-4 font-bold text-slate-800">Business Summary</h2>
          <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={summaryData} dataKey="value" innerRadius={54} outerRadius={78} paddingAngle={2}>
                  {summaryData.map(item => <Cell key={item.name} fill={item.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {summaryData.map(item => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                  <span className="font-semibold text-slate-700">{formatCurr(item.value)} ({((item.value / summaryTotal) * 100).toFixed(1)}%)</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">Total</span>
                <span className="font-bold text-slate-800">{formatCurr(summaryTotal)}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Recent Transactions</h2>
            <Link to="/reports/monthly" className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600">View All</Link>
          </div>
          <div className="space-y-3">
            {data.recentTransactions.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClasses[item.tone].icon}`}>
                  {item.tone === 'green' ? <ShoppingCart size={18} /> : item.tone === 'blue' ? <CreditCard size={18} /> : item.tone === 'purple' ? <Users size={18} /> : <ClipboardList size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                  <p className="truncate text-xs text-slate-400">{item.ref}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-800">{formatCurr(item.amount)}</p>
                  <p className="text-xs text-slate-400">{formatDateShort(item.date)}</p>
                </div>
              </div>
            ))}
            {data.recentTransactions.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No transactions found</p>}
          </div>
        </section>

        <section className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Due Collections</h2>
            <Link to="/customers/due-received" className="rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-600">View All</Link>
          </div>
          <div className="space-y-3">
            {data.dueCollectionRows.map(payment => (
              <div key={payment.id} className="flex items-center gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <CreditCard size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{payment.customerName}</p>
                  <p className="truncate text-xs text-slate-400">{payment.accountName} · {formatDateShort(payment.date)}</p>
                </div>
                <p className="text-sm font-bold text-brand-green">{formatCurr(payment.amount)}</p>
              </div>
            ))}
            {data.dueCollectionRows.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No due collections found</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

function MetricCard({ title, value, icon, tone, trend, inverted = false, wide = false }: { title: string; value: string; icon: React.ReactNode; tone: CardTone; trend: number; inverted?: boolean; wide?: boolean }) {
  const positive = inverted ? trend <= 0 : trend >= 0
  const trendText = `${trend >= 0 ? '+' : '-'}${Math.abs(trend).toFixed(1)}%`

  return (
    <section className={`card min-h-[132px] overflow-hidden ${wide ? 'lg:col-span-1' : ''}`}>
      <div className="flex items-start gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone].icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <p className={`text-xs font-bold ${positive ? 'text-brand-green' : 'text-brand-red'}`}>
              {trendText} <span className="font-semibold text-slate-500">vs Last Period</span>
            </p>
            <Sparkline color={positive ? '#22c55e' : '#ef4444'} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Sparkline({ color }: { color: string }) {
  return (
    <svg width="86" height="28" viewBox="0 0 86 28" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M1 23C8 20 12 21 18 17C24 13 28 16 34 12C40 8 45 9 51 5C58 11 63 7 68 13C74 17 80 12 85 9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1 23C8 20 12 21 18 17C24 13 28 16 34 12C40 8 45 9 51 5C58 11 63 7 68 13C74 17 80 12 85 9V28H1V23Z" fill={color} opacity="0.08" />
    </svg>
  )
}
