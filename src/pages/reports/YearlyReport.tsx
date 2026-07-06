import React, { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDays, CheckCircle2, ClipboardList, CreditCard, Package, RefreshCw, Target, TrendingUp, WalletCards } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { readOtherIncomeFallbackRows } from '../../lib/otherIncomeFallback'
import { isMissingTableError } from '../../lib/supabaseErrors'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import toast from 'react-hot-toast'

type MonthRow = {
  month: string
  monthIndex: number
  salesGoal: number
  profitGoal: number
  salesAmount: number
  discount: number
  actualSales: number
  purchaseOrderValue: number
  purchaseIncentive: number
  purchaseDeposit: number
  purchaseQty: number
  totalProfit: number
  otherIncome: number
  expenses: number
  profitLoss: number
  profitWithdraw: number
  availableProfit: number
}

type Summary = {
  salesGoal: number
  profitGoal: number
  totalSales: number
  actualSales: number
  totalProfit: number
  profitLoss: number
  profitMargin: number
  totalPurchases: number
  purchaseIncentive: number
  purchaseDeposit: number
  totalOtherIncome: number
  totalExpenses: number
  profitWithdraw: number
  availableProfit: number
  purchaseQty: number
}

type CompanyWayRow = {
  company: string
  purchase: number
  sales: number
}

const emptySummary: Summary = {
  salesGoal: 0,
  profitGoal: 0,
  totalSales: 0,
  actualSales: 0,
  totalProfit: 0,
  profitLoss: 0,
  profitMargin: 0,
  totalPurchases: 0,
  purchaseIncentive: 0,
  purchaseDeposit: 0,
  totalOtherIncome: 0,
  totalExpenses: 0,
  profitWithdraw: 0,
  availableProfit: 0,
  purchaseQty: 0,
}

export default function YearlyReport() {
  const { user } = useAuth()
  const { formatCurr, formatNum, monthName, monthShort } = useLang()
  const [year, setYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<MonthRow[]>([])
  const [companyWayRows, setCompanyWayRows] = useState<CompanyWayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    loadData()
  }, [year])

  function monthFromDate(date: string) {
    return new Date(date).getMonth() + 1
  }

  function pct(value: number, total: number) {
    return total > 0 ? (value / total) * 100 : 0
  }

  function companyName(value: string | null | undefined) {
    const name = String(value || '').trim()
    return name || 'Unassigned'
  }

  async function loadData() {
    try {
      setLoading(true)
      const startDate = `${year}-01-01`
      const endDate = `${year}-12-31`

      const [salesRes, purchasesRes, expensesRes, targetsRes, withdrawRes, otherIncomeRes, productsRes] = await Promise.all([
        supabase
          .from('sales')
          .select('date, subtotal, discount_amount, net_amount, paid_amount, due_amount, sale_items(*)')
          .eq('status', 'completed')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('purchases')
          .select('date, supplier_name, total_amount, net_amount, purchase_items(*)')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('expenses')
          .select('date, amount')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('monthly_targets')
          .select('month, sales_target, profit_target')
          .eq('year', year),
        supabase
          .from('profit_withdrawals')
          .select('date, profit_month, profit_year, amount')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('other_incomes')
          .select('date, amount, income_type')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('products')
          .select('id, product_code, suppliers(name, company_name)'),
      ])

      if (salesRes.error) throw salesRes.error
      if (purchasesRes.error) throw purchasesRes.error
      if (expensesRes.error) throw expensesRes.error
      if (targetsRes.error) throw targetsRes.error
      if (withdrawRes.error) throw withdrawRes.error
      if (otherIncomeRes.error && !isMissingTableError(otherIncomeRes.error, 'other_incomes')) throw otherIncomeRes.error
      if (productsRes.error) throw productsRes.error

      const sales = salesRes.data || []
      const purchases = purchasesRes.data || []
      const expenses = expensesRes.data || []
      const targets = targetsRes.data || []
      const withdrawals = withdrawRes.data || []
      const otherIncomes = otherIncomeRes.error
        ? readOtherIncomeFallbackRows(user?.id).filter(row => row.date >= startDate && row.date <= endDate)
        : otherIncomeRes.data || []
      const productCompanyMap = new Map<string, string>()
      ;(productsRes.data || []).forEach((product: any) => {
        const supplier = Array.isArray(product.suppliers) ? product.suppliers[0] : product.suppliers
        const name = companyName(supplier?.company_name || supplier?.name)
        if (product.id) productCompanyMap.set(product.id, name)
        if (product.product_code) productCompanyMap.set(product.product_code, name)
      })

      const nextRows = Array.from({ length: 12 }, (_, i) => {
        const monthIndex = i + 1
        const monthSales = sales.filter((sale: any) => monthFromDate(sale.date) === monthIndex)
        const monthPurchases = purchases.filter((purchase: any) => monthFromDate(purchase.date) === monthIndex)
        const monthExpenses = expenses.filter((expense: any) => monthFromDate(expense.date) === monthIndex)
        const monthOtherIncomes = otherIncomes.filter((income: any) => monthFromDate(income.date) === monthIndex)
        const monthTarget = targets.find((target: any) => Number(target.month) === monthIndex)
        const monthWithdrawals = withdrawals.filter((withdrawal: any) => {
          const profitYear = Number(withdrawal.profit_year || 0)
          const profitMonth = Number(withdrawal.profit_month || 0)
          if (profitYear === year && profitMonth > 0) return profitMonth === monthIndex
          return monthFromDate(withdrawal.date) === monthIndex
        })

        const salesAmount = monthSales.reduce((sum: number, sale: any) => sum + Number(sale.subtotal || sale.net_amount || 0), 0)
        const discount = monthSales.reduce((sum: number, sale: any) => sum + Number(sale.discount_amount || 0), 0)
        const totalProfit = monthSales.reduce((saleSum: number, sale: any) => {
          return saleSum + (sale.sale_items || []).reduce((itemSum: number, item: any) => {
            const costPrice = Number(item.cost_price || 0)
            if (costPrice <= 0) return itemSum
            return itemSum + (Number(item.actual_price || 0) - costPrice) * Number(item.qty || 0)
          }, 0)
        }, 0)
        const purchaseOrderValue = monthPurchases.reduce((sum: number, purchase: any) => sum + Number(purchase.net_amount || purchase.total_amount || 0), 0)
        const purchaseStats = monthPurchases.reduce((stats: { incentive: number; deposit: number; qty: number }, purchase: any) => {
          ;(purchase.purchase_items || []).forEach((item: any) => {
            const itemAmount = Number(item.total_amount || 0)
            const incentive = Number(item.sp_amount || 0)
            stats.incentive += incentive
            stats.deposit += Math.max(0, itemAmount - incentive)
            stats.qty += Number(item.qty || 0)
          })
          return stats
        }, { incentive: 0, deposit: 0, qty: 0 })
        const expenseAmount = monthExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0)
        const otherIncomeAmount = monthOtherIncomes.reduce((sum: number, income: any) => sum + Number(income.amount || 0), 0)
        const profitWithdraw = monthWithdrawals.reduce((sum: number, withdrawal: any) => sum + Number(withdrawal.amount || 0), 0)
        const totalBusinessProfit = totalProfit + otherIncomeAmount
        const profitLoss = totalProfit + otherIncomeAmount - expenseAmount

        return {
          month: monthShort(monthIndex),
          monthIndex,
          salesGoal: Number(monthTarget?.sales_target || 0),
          profitGoal: Number(monthTarget?.profit_target || 0),
          salesAmount,
          discount,
          actualSales: salesAmount - discount,
          purchaseOrderValue,
          purchaseIncentive: purchaseStats.incentive,
          purchaseDeposit: purchaseStats.deposit,
          purchaseQty: purchaseStats.qty,
          totalProfit,
          otherIncome: otherIncomeAmount,
          expenses: expenseAmount,
          profitLoss: totalBusinessProfit - expenseAmount,
          profitWithdraw,
          availableProfit: totalBusinessProfit - expenseAmount - profitWithdraw,
        }
      })

      const companyMap: Record<string, CompanyWayRow> = {}
      purchases.forEach((purchase: any) => {
        const company = companyName(purchase.supplier_name)
        const current = companyMap[company] || { company, purchase: 0, sales: 0 }
        const itemTotal = (purchase.purchase_items || []).reduce((sum: number, item: any) => sum + Number(item.total_amount || 0), 0)
        current.purchase += itemTotal || Number(purchase.total_amount || purchase.net_amount || 0)
        companyMap[company] = current
      })
      sales.forEach((sale: any) => {
        ;(sale.sale_items || []).forEach((item: any) => {
          const company = companyName(productCompanyMap.get(item.product_id) || productCompanyMap.get(item.product_code))
          const current = companyMap[company] || { company, purchase: 0, sales: 0 }
          current.sales += Number(item.selling_price || 0) * Number(item.qty || 0) || Number(item.total_amount || 0)
          companyMap[company] = current
        })
      })

      setRows(nextRows)
      setCompanyWayRows(Object.values(companyMap).sort((a, b) => (b.purchase + b.sales) - (a.purchase + a.sales)))
      setLastUpdated(new Date())
    } catch (err: any) {
      toast.error(err.message || 'Failed to load yearly report')
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo<Summary>(() => {
    const totals = rows.reduce((acc, row) => ({
      salesGoal: acc.salesGoal + row.salesGoal,
      profitGoal: acc.profitGoal + row.profitGoal,
      totalSales: acc.totalSales + row.salesAmount,
      actualSales: acc.actualSales + row.actualSales,
      totalProfit: acc.totalProfit + row.totalProfit,
      profitLoss: acc.profitLoss + row.profitLoss,
      profitMargin: 0,
      totalPurchases: acc.totalPurchases + row.purchaseOrderValue,
      purchaseIncentive: acc.purchaseIncentive + row.purchaseIncentive,
      purchaseDeposit: acc.purchaseDeposit + row.purchaseDeposit,
      totalOtherIncome: acc.totalOtherIncome + row.otherIncome,
      totalExpenses: acc.totalExpenses + row.expenses,
      profitWithdraw: acc.profitWithdraw + row.profitWithdraw,
      availableProfit: acc.availableProfit + row.availableProfit,
      purchaseQty: acc.purchaseQty + row.purchaseQty,
    }), emptySummary)

    return {
      ...totals,
      profitMargin: totals.actualSales > 0 ? (totals.profitLoss / totals.actualSales) * 100 : 0,
    }
  }, [rows])

  const startLabel = `1-${monthShort(1)}-${year}`
  const endLabel = `31-${monthShort(12)}-${year}`
  const salesAchievedPct = pct(summary.actualSales, summary.salesGoal)
  const profitAchievedPct = pct(summary.totalProfit + summary.totalOtherIncome, summary.profitGoal)
  const hasYearData = rows.some(row => row.actualSales || row.purchaseOrderValue || row.expenses || row.totalProfit || row.otherIncome)
  const bestMonth = rows.reduce((best, row) => row.profitLoss > best.profitLoss ? row : best, rows[0] || null)
  const chartRows = rows.map(row => ({
    ...row,
    purchaseTrend: row.purchaseOrderValue,
  }))
  const companyWayTotals = useMemo(() => companyWayRows.reduce((totals, row) => ({
    purchase: totals.purchase + row.purchase,
    sales: totals.sales + row.sales,
  }), { purchase: 0, sales: 0 }), [companyWayRows])

  function StatCard({
    title,
    value,
    subtitle,
    progress,
    tone = 'slate',
  }: {
    title: string
    value: string
    subtitle: string
    progress?: number
    tone?: 'green' | 'red' | 'blue' | 'orange' | 'purple' | 'slate'
  }) {
    const barClass = {
      green: 'bg-brand-green',
      red: 'bg-brand-red',
      blue: 'bg-blue-600',
      orange: 'bg-brand-orange',
      purple: 'bg-violet-600',
      slate: 'bg-slate-500',
    }[tone]

    return (
      <div className="min-h-[148px] rounded-xl border border-slate-200 bg-white p-4 shadow-[0_4px_20px_0_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_8px_28px_0_rgba(0,0,0,0.08)]">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase leading-snug tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-black leading-tight text-slate-950 tabular-nums break-words">{value}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>
        </div>
        {progress !== undefined && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
          </div>
        )}
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

  function TableValue({ value, money = true, strong = false, tone }: { value: number; money?: boolean; strong?: boolean; tone?: 'green' | 'red' | 'blue' }) {
    const textTone = tone === 'green' ? 'text-brand-green' : tone === 'red' ? 'text-brand-red' : tone === 'blue' ? 'text-blue-700' : 'text-slate-700'
    return (
      <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${textTone}`}>
        {value !== 0 ? (money ? formatCurr(value) : formatNum(value)) : '0'}
      </td>
    )
  }

  const tooltipStyle = {
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
    fontSize: 12,
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 lg:p-6">
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Business Performance Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Purchase, Sales & Profit Overview</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase text-slate-500">Year</span>
              <select className="mt-1 w-full bg-transparent text-sm font-bold text-slate-800 outline-none" value={year} onChange={e => setYear(Number(e.target.value))}>
                {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase text-slate-500">Date Range</span>
              <div className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-800"><CalendarDays size={14} /> {startLabel} - {endLabel}</div>
            </div>
            <button onClick={loadData} className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100">
              <span className="flex items-center gap-2"><RefreshCw size={16} /> Refresh</span>
              <span className="text-xs font-medium text-slate-500">{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-green border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-3xl font-black text-blue-700">{formatNum(year)}</p>
              <p className="text-xs font-bold uppercase text-blue-700">Overview</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-green-100 bg-green-50 p-2">
                <p className="text-[10px] font-semibold uppercase text-green-700">Sales</p>
                <p className="text-sm font-bold text-green-800">{salesAchievedPct.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-2">
                <p className="text-[10px] font-semibold uppercase text-blue-700">Profit</p>
                <p className="text-sm font-bold text-blue-800">{profitAchievedPct.toFixed(1)}%</p>
              </div>
            </div>
            <div className="mt-3">
              <OverviewLine icon={<CalendarDays size={14} />} label="Start Date" value={startLabel} />
              <OverviewLine icon={<Target size={14} />} label="Sales Target" value={formatCurr(summary.salesGoal)} />
              <OverviewLine icon={<Target size={14} />} label="Profit Target" value={formatCurr(summary.profitGoal)} />
              <OverviewLine icon={<Package size={14} />} label="Total Purchase" value={formatCurr(summary.totalPurchases)} />
              <OverviewLine icon={<WalletCards size={14} />} label="Incentive Profit" value={formatCurr(summary.purchaseIncentive)} tone="blue" />
              <OverviewLine icon={<TrendingUp size={14} />} label="Actual Sales" value={formatCurr(summary.actualSales)} />
              <OverviewLine icon={<TrendingUp size={14} />} label="Actual Sales Profit" value={formatCurr(summary.totalProfit)} tone="green" />
              <OverviewLine icon={<WalletCards size={14} />} label="Other Income" value={formatCurr(summary.totalOtherIncome)} tone="green" />
              <OverviewLine icon={<ClipboardList size={14} />} label="Expenses" value={formatCurr(summary.totalExpenses)} tone="red" />
              <OverviewLine icon={<CheckCircle2 size={14} />} label="Profit / Loss" value={formatCurr(summary.profitLoss)} tone={summary.profitLoss >= 0 ? 'green' : 'red'} />
              <OverviewLine icon={<CreditCard size={14} />} label="Profit Withdraw" value={formatCurr(summary.profitWithdraw)} tone="red" />
              <OverviewLine icon={<WalletCards size={14} />} label="Available Profit" value={formatCurr(summary.availableProfit)} tone={summary.availableProfit >= 0 ? 'green' : 'red'} />
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
                    {companyWayRows.map(row => (
                      <tr key={row.company} className="border-t border-slate-100">
                        <td className="truncate px-2 py-1.5 font-medium text-slate-700" title={row.company}>{row.company}</td>
                        <td className="whitespace-nowrap px-1.5 py-1.5 text-right font-semibold tabular-nums text-slate-700">{formatCurr(row.purchase)}</td>
                        <td className="whitespace-nowrap px-1.5 py-1.5 text-right font-semibold tabular-nums text-brand-green">{formatCurr(row.sales)}</td>
                      </tr>
                    ))}
                    {companyWayRows.length === 0 && (
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
            {!hasYearData && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                No yearly activity found for {formatNum(year)}. Targets can still appear if they were set in Settings.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <StatCard title="Sales Target And Achievements" value={formatCurr(summary.actualSales)} subtitle={`${salesAchievedPct.toFixed(1)}% of ${formatCurr(summary.salesGoal)}`} tone="blue" progress={salesAchievedPct} />
              <StatCard title="Profit Targets And Achievements" value={formatCurr(summary.totalProfit + summary.totalOtherIncome)} subtitle={`${profitAchievedPct.toFixed(1)}% of ${formatCurr(summary.profitGoal)}`} tone="green" progress={profitAchievedPct} />
              <StatCard title="Incentive Profit" value={formatCurr(summary.purchaseIncentive)} subtitle="Purchase incentive revenue" tone="blue" />
              <StatCard title="Other Income" value={formatCurr(summary.totalOtherIncome)} subtitle="Miscellaneous income records" tone="blue" />
              <StatCard title="Total Expenses" value={formatCurr(summary.totalExpenses)} subtitle={`${pct(summary.totalExpenses, summary.actualSales).toFixed(2)}% of sales`} tone="red" />
              <StatCard title="Profit / Loss" value={formatCurr(summary.profitLoss)} subtitle={`${summary.profitMargin.toFixed(2)}% net profit margin`} tone={summary.profitLoss >= 0 ? 'green' : 'red'} />
            </div>

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">Monthly Profit / Loss Trend ({year})</h2>
                    <p className="mt-0.5 text-xs text-slate-500">Best {bestMonth ? monthShort(bestMonth.monthIndex) : '-'}: {formatCurr(bestMonth?.profitLoss || 0)}</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                    <Tooltip formatter={(value: number) => formatCurr(value)} contentStyle={tooltipStyle} />
                    <Legend />
                    <Line type="monotone" dataKey="profitLoss" name="Profit / Loss" stroke="#1D9E75" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="profitGoal" name="Profit Goal" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <h2 className="text-sm font-bold text-slate-800">Monthly Sales vs Goal ({year})</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Achieved {formatCurr(summary.actualSales)} of {formatCurr(summary.salesGoal)}</p>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                    <Tooltip formatter={(value: number) => formatCurr(value)} contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="actualSales" name="Sales Amount" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="salesGoal" name="Sales Goal" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="bg-blue-800 px-4 py-2 text-center text-sm font-bold uppercase tracking-wide text-white">Yearly Business Performance & Profit Overview ({year})</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] text-[11px]">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left">Month</th>
                        <th className="px-2 py-2 text-right">Sales Target</th>
                        <th className="px-2 py-2 text-right">Actual Sales</th>
                        <th className="px-2 py-2 text-right">Profit Target</th>
                        <th className="px-2 py-2 text-right">Sales Profit</th>
                        <th className="px-2 py-2 text-right">Others Income</th>
                        <th className="px-2 py-2 text-right">Total Profit</th>
                        <th className="px-2 py-2 text-right">Total Expense</th>
                        <th className="px-2 py-2 text-right">Profit and Loss</th>
                        <th className="px-2 py-2 text-right">Profit Withdraw</th>
                        <th className="px-2 py-2 text-right">Available Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.monthIndex} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="sticky left-0 bg-white px-2 py-2 font-medium text-slate-700">{monthName(row.monthIndex)}</td>
                          <TableValue value={row.salesGoal} />
                          <TableValue value={row.actualSales} tone="green" />
                          <TableValue value={row.profitGoal} />
                          <TableValue value={row.totalProfit} tone="green" />
                          <TableValue value={row.otherIncome} tone="green" />
                          <TableValue value={row.totalProfit + row.otherIncome} tone="green" strong />
                          <TableValue value={row.expenses} tone="red" />
                          <TableValue value={row.profitLoss} tone={row.profitLoss >= 0 ? 'green' : 'red'} />
                          <TableValue value={row.profitWithdraw} tone="red" />
                          <TableValue value={row.availableProfit} tone={row.availableProfit >= 0 ? 'green' : 'red'} strong />
                        </tr>
                      ))}
                      <tr className="bg-blue-800 text-white">
                        <td className="sticky left-0 bg-blue-800 px-2 py-2 font-bold">Total</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.salesGoal)}</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.actualSales)}</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.profitGoal)}</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.totalProfit)}</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.totalOtherIncome)}</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.totalProfit + summary.totalOtherIncome)}</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.totalExpenses)}</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.profitLoss)}</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.profitWithdraw)}</td>
                        <td className="px-2 py-2 text-right font-bold">{formatCurr(summary.availableProfit)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

            </div>
          </main>
        </div>
      )}
    </div>
  )
}
