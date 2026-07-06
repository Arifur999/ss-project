import React, { useEffect, useMemo, useState } from 'react'
import { Calendar, ClipboardList, Target, TrendingUp, WalletCards } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import PageHeader from '../../components/PageHeader'
import { supabase } from '../../lib/supabase'
import { readOtherIncomeFallbackRows } from '../../lib/otherIncomeFallback'
import { isMissingTableError } from '../../lib/supabaseErrors'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import toast from 'react-hot-toast'

const COLORS = ['#bae6fd', '#fecaca', '#fed7aa', '#bbf7d0', '#ddd6fe', '#fbcfe8', '#c7d2fe', '#fde68a', '#a7f3d0', '#e2e8f0']

type BreakdownRow = {
  name: string
  incomeType?: string
  qty?: number
  amount: number
  percent: number
  cost?: number
  profit?: number
  spAmount?: number
  actualPurchase?: number
  payment?: number
  due?: number
}

type MonthlyReportData = {
  target: any
  totalSales: number
  totalPaid: number
  totalDue: number
  totalPurchases: number
  totalExpenses: number
  totalIncentiveProfit: number
  totalOtherIncome: number
  supplierCommissionIncome: number
  otherSourceIncome: number
  grossProfit: number
  netProfit: number
  totalSalesQty: number
  totalPurchaseQty: number
  salesCount: number
  purchaseCount: number
  purchaseBreakdown: BreakdownRow[]
  supplierBreakdown: BreakdownRow[]
  salesBreakdown: BreakdownRow[]
  expenseBreakdown: BreakdownRow[]
  otherIncomeBreakdown: BreakdownRow[]
  dailySales: { day: number; sales: number; profit: number }[]
}

export default function MonthlyReport() {
  const { user } = useAuth()
  const { t, formatCurr, formatNum, monthName } = useLang()
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState<MonthlyReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [month, year])

  function pct(value: number, total: number) {
    return total > 0 ? (value / total) * 100 : 0
  }

  async function loadData() {
    try {
      setLoading(true)
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

      const [salesRes, purchasesRes, supplierPaymentsRes, expensesRes, categoriesRes, targetRes, otherIncomeRes] = await Promise.all([
        supabase
          .from('sales')
          .select('id, date, net_amount, paid_amount, due_amount, sale_items(*)')
          .eq('status', 'completed')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('purchases')
          .select('id, date, supplier_id, supplier_name, net_amount, purchase_items(*)')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('supplier_payments')
          .select('supplier_id, supplier_name, amount')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('expenses')
          .select('amount, category_name, category_id')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('expense_categories')
          .select('name, monthly_budget')
          .eq('is_active', true),
        supabase
          .from('monthly_targets')
          .select('*')
          .eq('year', year)
          .eq('month', month)
          .maybeSingle(),
        supabase
          .from('other_incomes')
          .select('amount, income_type, supplier_name, source_name')
          .gte('date', startDate)
          .lte('date', endDate),
      ])

      if (salesRes.error) throw salesRes.error
      if (purchasesRes.error) throw purchasesRes.error
      if (supplierPaymentsRes.error) throw supplierPaymentsRes.error
      if (expensesRes.error) throw expensesRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (targetRes.error) throw targetRes.error
      if (otherIncomeRes.error && !isMissingTableError(otherIncomeRes.error, 'other_incomes')) throw otherIncomeRes.error

      const sales = salesRes.data || []
      const purchases = purchasesRes.data || []
      const supplierPayments = supplierPaymentsRes.data || []
      const expenses = expensesRes.data || []
      const categories = categoriesRes.data || []
      const target = targetRes.data || null
      const otherIncomes = otherIncomeRes.error
        ? readOtherIncomeFallbackRows(user?.id).filter(row => row.date >= startDate && row.date <= endDate)
        : otherIncomeRes.data || []

      const totalSales = sales.reduce((sum: number, sale: any) => sum + Number(sale.net_amount || 0), 0)
      const totalPaid = sales.reduce((sum: number, sale: any) => sum + Number(sale.paid_amount || 0), 0)
      const totalDue = sales.reduce((sum: number, sale: any) => sum + Number(sale.due_amount || 0), 0)
      const totalExpenses = expenses.reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0)
      const totalOtherIncome = otherIncomes.reduce((sum: number, income: any) => sum + Number(income.amount || 0), 0)
      const supplierCommissionIncome = otherIncomes
        .filter((income: any) => income.income_type === 'supplier')
        .reduce((sum: number, income: any) => sum + Number(income.amount || 0), 0)
      const otherSourceIncome = otherIncomes
        .filter((income: any) => income.income_type === 'other')
        .reduce((sum: number, income: any) => sum + Number(income.amount || 0), 0)
      const otherIncomeMap: Record<string, BreakdownRow> = {}
      otherIncomes.forEach((income: any) => {
        const incomeType = income.income_type === 'supplier' ? 'Supplier' : 'Other'
        const name = income.income_type === 'supplier'
          ? income.supplier_name || 'Unknown Supplier'
          : income.source_name || 'Other Source'
        const key = `${incomeType}-${name}`
        const current = otherIncomeMap[key] || { name, incomeType, amount: 0, percent: 0 }
        current.amount += Number(income.amount || 0)
        otherIncomeMap[key] = current
      })
      const otherIncomeBreakdown = Object.values(otherIncomeMap)
        .map(row => ({ ...row, percent: pct(row.amount, totalOtherIncome) }))
        .sort((a, b) => b.amount - a.amount)

      const saleProductMap: Record<string, BreakdownRow> = {}
      sales.forEach((sale: any) => {
        ;(sale.sale_items || []).forEach((item: any) => {
          const name = item.product_name || 'Unknown Product'
          const qty = Number(item.qty || 0)
          const amount = Number(item.total_amount || 0)
          const costPrice = Number(item.cost_price || 0)
          const cost = costPrice > 0 ? costPrice * qty : 0
          const profit = costPrice > 0 ? (Number(item.actual_price || 0) - costPrice) * qty : 0
          const current = saleProductMap[name] || { name, qty: 0, amount: 0, cost: 0, profit: 0, percent: 0 }
          current.qty = Number(current.qty || 0) + qty
          current.amount += amount
          current.cost = Number(current.cost || 0) + cost
          current.profit = Number(current.profit || 0) + profit
          saleProductMap[name] = current
        })
      })

      const salesBreakdown = Object.values(saleProductMap)
        .map(row => ({ ...row, percent: pct(row.amount, totalSales) }))
        .sort((a, b) => b.amount - a.amount)
      const grossProfit = salesBreakdown.reduce((sum, row) => sum + Number(row.profit || 0), 0)

      const purchaseProductMap: Record<string, BreakdownRow> = {}
      purchases.forEach((purchase: any) => {
        ;(purchase.purchase_items || []).forEach((item: any) => {
          const name = item.product_name || 'Unknown Product'
          const qty = Number(item.qty || 0)
          const amount = Number(item.total_amount || 0)
          const spAmount = Number(item.sp_amount || 0)
          const actualPurchase = Number(item.deposit_amount || 0) || Math.max(0, amount - spAmount)
          const current = purchaseProductMap[name] || { name, qty: 0, amount: 0, spAmount: 0, actualPurchase: 0, percent: 0 }
          current.qty = Number(current.qty || 0) + qty
          current.amount += amount
          current.spAmount = Number(current.spAmount || 0) + spAmount
          current.actualPurchase = Number(current.actualPurchase || 0) + actualPurchase
          purchaseProductMap[name] = current
        })
      })

      const purchaseRows = Object.values(purchaseProductMap)
      const totalPurchases = purchaseRows.reduce((sum, row) => sum + row.amount, 0)
      const totalIncentiveProfit = purchaseRows.reduce((sum, row) => sum + Number(row.spAmount || 0), 0)
      const netProfit = grossProfit + totalIncentiveProfit + totalOtherIncome - totalExpenses
      const totalPurchaseQty = purchaseRows.reduce((sum, row) => sum + Number(row.qty || 0), 0)
      const purchaseBreakdown = Object.values(purchaseProductMap)
        .map(row => ({ ...row, percent: pct(row.amount, totalPurchases) }))
        .sort((a, b) => b.amount - a.amount)

      const supplierMap: Record<string, BreakdownRow> = {}
      purchases.forEach((purchase: any) => {
        const supplierKey = purchase.supplier_id || purchase.supplier_name || 'Unknown Supplier'
        const name = purchase.supplier_name || 'Unknown Supplier'
        const amount = Number(purchase.net_amount || 0)
        const qty = (purchase.purchase_items || []).reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0)
        const current = supplierMap[supplierKey] || { name, qty: 0, amount: 0, payment: 0, due: 0, percent: 0 }
        current.qty = Number(current.qty || 0) + qty
        current.amount += amount
        supplierMap[supplierKey] = current
      })
      supplierPayments.forEach((payment: any) => {
        const supplierKey = payment.supplier_id || payment.supplier_name || 'Unknown Supplier'
        const name = payment.supplier_name || supplierMap[supplierKey]?.name || 'Unknown Supplier'
        const current = supplierMap[supplierKey] || { name, qty: 0, amount: 0, payment: 0, due: 0, percent: 0 }
        current.payment = Number(current.payment || 0) + Number(payment.amount || 0)
        supplierMap[supplierKey] = current
      })
      const supplierBreakdown = Object.values(supplierMap)
        .map(row => ({
          ...row,
          due: Number(row.amount || 0) - Number(row.payment || 0),
          percent: pct(row.amount, totalPurchases),
        }))
        .sort((a, b) => b.amount - a.amount)

      const expenseMap: Record<string, BreakdownRow> = {}
      categories.forEach((category: any) => {
        const name = category.name || 'Uncategorized'
        expenseMap[name] = { name, amount: 0, percent: 0 }
      })
      expenses.forEach((expense: any) => {
        const name = expense.category_name || 'Uncategorized'
        const current = expenseMap[name] || { name, amount: 0, percent: 0 }
        current.amount += Number(expense.amount || 0)
        expenseMap[name] = current
      })
      const expenseBreakdown = Object.values(expenseMap)
        .map(row => ({ ...row, percent: pct(row.amount, totalExpenses) }))
        .sort((a, b) => b.amount - a.amount)

      const dailyMap: Record<number, { day: number; sales: number; profit: number }> = {}
      sales.forEach((sale: any) => {
        const day = new Date(sale.date).getDate()
        const saleProfit = (sale.sale_items || []).reduce((sum: number, item: any) =>
          sum + (Number(item.cost_price || 0) > 0 ? (Number(item.actual_price || 0) - Number(item.cost_price || 0)) * Number(item.qty || 0) : 0), 0)
        dailyMap[day] = {
          day,
          sales: (dailyMap[day]?.sales || 0) + Number(sale.net_amount || 0),
          profit: (dailyMap[day]?.profit || 0) + saleProfit,
        }
      })
      const dailySales = Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => dailyMap[i + 1] || { day: i + 1, sales: 0, profit: 0 })

      setData({
        target,
        totalSales,
        totalPaid,
        totalDue,
        totalPurchases,
        totalExpenses,
        totalIncentiveProfit,
        totalOtherIncome,
        supplierCommissionIncome,
        otherSourceIncome,
        grossProfit,
        netProfit,
        totalSalesQty: salesBreakdown.reduce((sum, row) => sum + Number(row.qty || 0), 0),
        totalPurchaseQty,
        salesCount: sales.length,
        purchaseCount: purchases.length,
        purchaseBreakdown,
        supplierBreakdown,
        salesBreakdown,
        expenseBreakdown,
        otherIncomeBreakdown,
        dailySales,
      })
    } catch (err: any) {
      toast.error(err.message || 'Failed to load monthly report')
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    const salesTarget = Number(data?.target?.sales_target || 0)
    const profitTarget = Number(data?.target?.profit_target || 0)
    const totalSales = Number(data?.totalSales || 0)
    const achievedProfit = Number(data?.grossProfit || 0) + Number(data?.totalIncentiveProfit || 0) + Number(data?.totalOtherIncome || 0)
    const totalExpenses = Number(data?.totalExpenses || 0)
    return {
      salesTarget,
      profitTarget,
      salesPct: salesTarget > 0 ? (totalSales / salesTarget) * 100 : 0,
      profitPct: profitTarget > 0 ? (achievedProfit / profitTarget) * 100 : 0,
      salesGap: totalSales - salesTarget,
      profitGap: achievedProfit - profitTarget,
      expensePct: totalSales > 0 ? (totalExpenses / totalSales) * 100 : 0,
      netMargin: totalSales > 0 ? (Number(data?.netProfit || 0) / totalSales) * 100 : 0,
    }
  }, [data])

  function PercentBar({ value, color }: { value: number; color: string }) {
    return (
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    )
  }

  function MetricCard({
    icon,
    label,
    value,
    hint,
    tone = 'slate',
  }: {
    icon: React.ReactNode
    label: string
    value: string
    hint?: string
    tone?: 'slate' | 'green' | 'red' | 'blue' | 'orange'
  }) {
    const toneClass = {
      slate: 'bg-slate-100 text-slate-600',
      green: 'bg-green-100 text-green-700',
      red: 'bg-red-100 text-red-700',
      blue: 'bg-blue-100 text-blue-700',
      orange: 'bg-orange-100 text-orange-700',
    }[tone]

    return (
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          </div>
          <div className={`rounded-lg p-2 ${toneClass}`}>{icon}</div>
        </div>
        {hint && <p className="mt-3 text-sm text-slate-500">{hint}</p>}
      </div>
    )
  }

  const targetChart = data ? [
    { name: 'Sales', Target: summary.salesTarget, Achieved: data.totalSales },
    { name: 'Profit', Target: summary.profitTarget, Achieved: data.grossProfit + data.totalIncentiveProfit + data.totalOtherIncome },
  ] : []

  function BreakdownPie({ rows }: { rows: BreakdownRow[] }) {
    if (rows.length === 0) return <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">No data</div>
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={rows.slice(0, 10)} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={82} label={({ percent }) => `${(percent * 100).toFixed(1)}%`} labelLine={false}>
            {rows.slice(0, 10).map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(value: number) => formatCurr(value)} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <PageHeader title={t('monthly_title')} subtitle={`${monthName(month)} ${year} performance dashboard`} />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <Calendar size={16} className="text-slate-400" />
          <select className="bg-transparent text-sm font-medium outline-none" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
        </div>
        <input type="number" className="input w-28" value={year} onChange={e => setYear(Number(e.target.value))} min="2020" max="2035" />
        <div className="ml-auto text-sm font-medium text-slate-500">{monthName(month)} {formatNum(year)} report</div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-green border-t-transparent" />
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="card">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><Target size={15} /> Sales Target</div>
              <p className="mt-2 text-2xl font-bold text-slate-800">{formatCurr(summary.salesTarget)}</p>
              <p className="mt-1 text-sm text-brand-green">Achieved {formatCurr(data.totalSales)} ({summary.salesPct.toFixed(1)}%)</p>
              <p className={`mt-1 text-xs ${summary.salesGap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.salesGap >= 0 ? 'Over target' : 'Remaining'} {formatCurr(Math.abs(summary.salesGap))}
              </p>
              <PercentBar value={summary.salesPct} color="bg-brand-green" />
            </div>
            <div className="card">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500"><TrendingUp size={15} /> Profit Target</div>
              <p className="mt-2 text-2xl font-bold text-slate-800">{formatCurr(summary.profitTarget)}</p>
              <p className="mt-1 text-sm text-brand-green">Achieved {formatCurr(data.grossProfit + data.totalIncentiveProfit + data.totalOtherIncome)} ({summary.profitPct.toFixed(1)}%)</p>
              <p className={`mt-1 text-xs ${summary.profitGap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.profitGap >= 0 ? 'Over target' : 'Remaining'} {formatCurr(Math.abs(summary.profitGap))}
              </p>
              <PercentBar value={summary.profitPct} color="bg-blue-500" />
            </div>
            <MetricCard
              icon={<WalletCards size={18} />}
              label="Incentive Profit"
              value={formatCurr(data.totalIncentiveProfit)}
              hint="Total SP amount from monthly purchase"
              tone="blue"
            />
            <MetricCard
              icon={<WalletCards size={18} />}
              label="Other Income"
              value={formatCurr(data.totalOtherIncome)}
              hint={`Supplier ${formatCurr(data.supplierCommissionIncome)} / Other ${formatCurr(data.otherSourceIncome)}`}
              tone="green"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetricCard
              icon={<ClipboardList size={18} />}
              label="Total Expenses"
              value={formatCurr(data.totalExpenses)}
              hint={`${summary.expensePct.toFixed(1)}% expense share against sales`}
              tone="red"
            />
            <MetricCard
              icon={<ClipboardList size={18} />}
              label="Profit / Loss"
              value={formatCurr(data.netProfit)}
              tone={data.netProfit >= 0 ? 'green' : 'red'}
            />
          </div>

          <div className="card">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-800">Target vs Achieved</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={targetChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <Tooltip formatter={(value: number) => formatCurr(value)} />
                <Legend />
                <Bar dataKey="Target" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Achieved" fill="#1D9E75" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="card">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Purchase Breakdown</h3>
              <BreakdownPie rows={data.purchaseBreakdown} />
            </div>
            <div className="card">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Income Breakdown</h3>
              <BreakdownPie rows={data.salesBreakdown} />
            </div>
            <div className="card">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Expenses Breakdown</h3>
              <BreakdownPie rows={data.expenseBreakdown} />
            </div>
          </div>

          <div className="card">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-800">Daily Sales & Profit</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.dailySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                <Tooltip formatter={(value: number) => formatCurr(value)} />
                <Bar dataKey="sales" name="Sales" fill="#1D9E75" radius={[3, 3, 0, 0]} />
                <Bar dataKey="profit" name="Profit" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <BreakdownTable
                title="Sales & Profit"
                rows={data.salesBreakdown}
                total={data.totalSales}
                columns={[
                  ['Product Name', 'name'],
                  ['Sales QTY', 'qty'],
                  ['Sales Amount', 'amount'],
                  ['Cost', 'cost'],
                  ['Profit', 'profit'],
                  ['Breakdown %', 'percent'],
                ]}
                formatCurr={formatCurr}
                formatNum={formatNum}
              />
              <BreakdownTable
                title="Purchase"
                rows={data.purchaseBreakdown}
                total={data.totalPurchases}
                columns={[
                  ['Product Name', 'name'],
                  ['Purchase QTY', 'qty'],
                  ['Amount', 'amount'],
                  ['SP Amount', 'spAmount'],
                  ['Actual Purchase', 'actualPurchase'],
                  ['Breakdown %', 'percent'],
                ]}
                formatCurr={formatCurr}
                formatNum={formatNum}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <BreakdownTable
                title="Expenses"
                rows={data.expenseBreakdown}
                total={data.totalExpenses}
                columns={[
                  ['Expense Category', 'name'],
                  ['Amount', 'amount'],
                  ['Breakdown %', 'percent'],
                ]}
                formatCurr={formatCurr}
                formatNum={formatNum}
              />
              <BreakdownTable
                title="Supplier Payment"
                rows={data.supplierBreakdown}
                total={data.totalPurchases}
                columns={[
                  ['Supplier', 'name'],
                  ['Order Amount', 'amount'],
                  ['QTY', 'qty'],
                  ['Payment', 'payment'],
                  ['Due', 'due'],
                ]}
                formatCurr={formatCurr}
                formatNum={formatNum}
              />
              <BreakdownTable
                title="Other Income"
                rows={data.otherIncomeBreakdown}
                total={data.totalOtherIncome}
                columns={[
                  ['Supplier / Source', 'name'],
                  ['Type', 'incomeType'],
                  ['Amount', 'amount'],
                  ['Breakdown %', 'percent'],
                ]}
                formatCurr={formatCurr}
                formatNum={formatNum}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BreakdownTable({
  title,
  rows,
  total,
  columns,
  formatCurr,
  formatNum,
}: {
  title: string
  rows: BreakdownRow[]
  total: number
  columns: [string, keyof BreakdownRow][]
  formatCurr: (value: number) => string
  formatNum: (value: number) => string
}) {
  function formatValue(key: keyof BreakdownRow, value: any) {
    if (key === 'name') return value || '-'
    if (key === 'incomeType') return value || '-'
    if (key === 'qty') return formatNum(Number(value || 0))
    if (key === 'percent') return `${Number(value || 0).toFixed(2)}%`
    return formatCurr(Number(value || 0))
  }

  function totalValue(key: keyof BreakdownRow) {
    if (key === 'percent') return rows.some(row => row.amount > 0) ? '100.00%' : '0.00%'
    if (key === 'qty') return formatNum(rows.reduce((sum, row) => sum + Number(row.qty || 0), 0))
    if (key === 'name') return 'Total Items'
    if (key === 'incomeType') return '-'
    return formatCurr(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0))
  }

  return (
    <div className="card flex min-h-[360px] min-w-0 flex-col overflow-hidden p-0">
      <div className="bg-slate-800 px-4 py-3 text-center text-sm font-bold uppercase tracking-[0.2em] text-white">{title}</div>
      <div className="flex-1 overflow-hidden">
        <table className="w-full table-fixed text-[11px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map(([label, key]) => (
                <th key={String(key)} className={`px-2 py-2 ${key === 'name' ? 'w-[34%] text-left' : 'text-right'}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-100 font-bold text-slate-800">
              {columns.map(([, key]) => (
                <td key={String(key)} className={`px-2 py-2 ${key === 'name' ? 'truncate text-left' : 'text-right'}`}>
                  {totalValue(key)}
                </td>
              ))}
            </tr>
            {rows.map((row, index) => (
              <tr key={`${row.name}-${index}`} className="border-t border-slate-100 hover:bg-slate-50">
                {columns.map(([, key]) => (
                  <td key={String(key)} className={`px-2 py-2 ${key === 'name' ? 'truncate font-medium text-slate-700' : 'text-right text-slate-600'}`} title={String(row[key] || '')}>
                    {formatValue(key, row[key])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
