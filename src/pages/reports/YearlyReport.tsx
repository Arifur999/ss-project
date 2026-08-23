import React, { useEffect, useMemo, useState } from 'react'
import TableScroller from '../../components/TableScroller'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDotsIcon as CalendarDays, CheckCircleIcon as CheckCircle2, ClipboardTextIcon as ClipboardList, ArrowsClockwiseIcon as RefreshCw, TargetIcon as Target, TrendUpIcon as TrendingUp, WalletIcon as WalletCards } from '@phosphor-icons/react'
import { availableProfit, businessEarnings, profitLoss, profitMargin, type ProfitInputs } from '../../lib/profit'
import { monthKey, targetCompletion } from '../../lib/purchaseRollingTarget'
import { supabase } from '../../lib/supabase'
import { readOtherIncomeFallbackRows } from '../../lib/otherIncomeFallback'
import { isMissingTableError } from '../../lib/supabaseErrors'
import { firstAmount, saleItemAmount } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import toast from 'react-hot-toast'
import { NoValue } from '../../components/CellValue'
import PageHeader from '../../components/PageHeader'
import { CHART_GREEN, CHART_MUTED, KpiCard, PeriodCard, PurchaseTargetDonut } from '../../components/ReportCards'
import { moneyAxisFormatter, seriesPeak } from '../../lib/chartAxis'

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

/**
 * One month's row in the shape the shared profit rules take.
 *
 * The same four terms as summaryProfitInputs, so a month row and the Total row
 * above it are worked out the same way rather than by two hand-written sums.
 */
function monthProfitInputs(row: Pick<MonthRow, 'totalProfit' | 'purchaseIncentive' | 'otherIncome' | 'expenses'>): ProfitInputs {
  return {
    grossProfit: row.totalProfit,
    purchaseIncentive: row.purchaseIncentive,
    otherIncome: row.otherIncome,
    expenses: row.expenses,
  }
}

/**
 * The year's totals, in the shape the shared profit rules take. The summary
 * carries the same four terms under longer names, so this is a rename rather
 * than a second calculation - which is the point: the card, the margin and the
 * month rows all read the same four numbers.
 */
function summaryProfitInputs(totals: Pick<Summary, 'totalProfit' | 'purchaseIncentive' | 'totalOtherIncome' | 'totalExpenses'>): ProfitInputs {
  return {
    grossProfit: totals.totalProfit,
    purchaseIncentive: totals.purchaseIncentive,
    otherIncome: totals.totalOtherIncome,
    expenses: totals.totalExpenses,
  }
}

type PurchaseTargetRow = {
  company: string
  target: number
  achieved: number
  remaining: number
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
  const { t, formatCurr, formatNum, monthName, monthShort } = useLang()
  const [year, setYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<MonthRow[]>([])
  const [companyWayRows, setCompanyWayRows] = useState<CompanyWayRow[]>([])
  const [purchaseTargetRows, setPurchaseTargetRows] = useState<PurchaseTargetRow[]>([])
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

        const salesAmount = monthSales.reduce((sum: number, sale: any) => sum + firstAmount(sale.subtotal, sale.net_amount), 0)
        const discount = monthSales.reduce((sum: number, sale: any) => sum + Number(sale.discount_amount || 0), 0)
        const totalProfit = monthSales.reduce((saleSum: number, sale: any) => {
          return saleSum + (sale.sale_items || []).reduce((itemSum: number, item: any) => {
            const costPrice = Number(item.cost_price || 0)
            if (costPrice <= 0) return itemSum
            return itemSum + (Number(item.actual_price || 0) - costPrice) * Number(item.qty || 0)
          }, 0)
        }, 0)
        const purchaseOrderValue = monthPurchases.reduce((sum: number, purchase: any) => sum + firstAmount(purchase.net_amount, purchase.total_amount), 0)
        const purchaseStats = monthPurchases.reduce((stats: { incentive: number; deposit: number; qty: number }, purchase: any) => {
          (purchase.purchase_items || []).forEach((item: any) => {
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
        // One definition, shared with the Dashboard and both other report pages.
        // These month rows used to leave purchaseStats.incentive out - the figure
        // was sitting right here, unused - so every Profit/Loss and Available
        // Profit in the table was short by the whole year's supplier incentive,
        // while the "Profit Achieved" card above the table did add it.
        const profitInputs: ProfitInputs = {
          grossProfit: totalProfit,
          purchaseIncentive: purchaseStats.incentive,
          otherIncome: otherIncomeAmount,
          expenses: expenseAmount,
        }

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
          profitLoss: profitLoss(profitInputs),
          profitWithdraw,
          availableProfit: availableProfit(profitInputs, profitWithdraw),
        }
      })

      const companyMap: Record<string, CompanyWayRow> = {}
      purchases.forEach((purchase: any) => {
        const company = companyName(purchase.supplier_name)
        const current = companyMap[company] || { company, purchase: 0, sales: 0 }
        const itemTotal = (purchase.purchase_items || []).reduce((sum: number, item: any) => sum + firstAmount(item.total_amount), 0)
        current.purchase += purchase.purchase_items?.length ? itemTotal : firstAmount(purchase.total_amount, purchase.net_amount)
        companyMap[company] = current
      })
      sales.forEach((sale: any) => {
        (sale.sale_items || []).forEach((item: any) => {
          const company = companyName(productCompanyMap.get(item.product_id) || productCompanyMap.get(item.product_code))
          const current = companyMap[company] || { company, purchase: 0, sales: 0 }
          // The discounted amount that was actually billed - the same basis as
          // the Report Summary's Company Ways table and as this page's own sales
          // figures. It used to lead with selling_price x qty, the pre-discount
          // MRP, so at an average 10% discount a company's yearly sales read
          // Tk 11,100,000 where the Report Summary read Tk 10,000,000 for the
          // same months. This is the number the supplier negotiation uses.
          current.sales += saleItemAmount(item, Number(item.qty || 0))
          companyMap[company] = current
        })
      })

      /*
       * Purchase targets, whole rather than month by month: the yearly page is
       * the long view, so it shows the target in full, everything bought
       * against it, and what is still to buy.
       *
       * Only targets that touch the year on screen, and their figures cover
       * the target's own months - a target running Nov to Feb is one target,
       * not two halves, and splitting it at the year end would report a
       * shortfall that is not real.
       */
      const [targetRes, allPurchaseRes] = await Promise.all([
        supabase.from('purchase_targets').select('*'),
        supabase.from('purchases').select('date, supplier_id, total_amount, net_amount, purchase_items(total_amount)'),
      ])

      const boughtBySupplier: Record<string, Record<string, number>> = {}
      ;(allPurchaseRes.error ? [] : allPurchaseRes.data || []).forEach((purchase: any) => {
        if (!purchase.supplier_id || !purchase.date) return
        const when = new Date(`${String(purchase.date).slice(0, 10)}T12:00:00`)
        const key = monthKey(when.getFullYear(), when.getMonth() + 1)
        const items = (purchase.purchase_items || []).reduce((sum: number, item: any) => sum + Number(item.total_amount || 0), 0)
        const value = items || Number(purchase.total_amount || purchase.net_amount || 0)
        const perSupplier = boughtBySupplier[purchase.supplier_id] || (boughtBySupplier[purchase.supplier_id] = {})
        perSupplier[key] = (perSupplier[key] || 0) + value
      })

      const targetRows: PurchaseTargetRow[] = (targetRes.error ? [] : targetRes.data || [])
        .filter((target: any) => Number(target.start_year) <= year && Number(target.end_year) >= year)
        .map((target: any) => {
          const supplier = Array.isArray(target.supplier) ? target.supplier[0] : target.supplier
          const done = targetCompletion(target, boughtBySupplier[target.supplier_id] || {})
          return {
            company: companyName(supplier?.company_name || supplier?.name),
            target: Number(target.total_amount || 0),
            achieved: done.achieved,
            remaining: done.remaining,
          }
        })
        .sort((a, b) => b.target - a.target)

      setRows(nextRows)
      setPurchaseTargetRows(targetRows)
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
      profitMargin: profitMargin(summaryProfitInputs(totals), totals.actualSales),
    }
  }, [rows])

  const startLabel = `1-${monthShort(1)}-${year}`
  const endLabel = `31-${monthShort(12)}-${year}`
  const salesAchievedPct = pct(summary.actualSales, summary.salesGoal)
  // What counts as profit against the yearly target: everything the business
  // earned before expenses come off it. Same shared definition as the month
  // rows, so this card and the Profit/Loss column below it can no longer
  // disagree about whether the supplier incentive counts - which is exactly
  // what they used to do.
  const profitAchieved = businessEarnings(summaryProfitInputs(summary))
  const profitAchievedPct = pct(profitAchieved, summary.profitGoal)
  const hasYearData = rows.some(row => row.actualSales || row.purchaseOrderValue || row.expenses || row.totalProfit || row.otherIncome)
  const bestMonth = rows.reduce((best, row) => row.profitLoss > best.profitLoss ? row : best, rows[0] || null)
  const chartRows = rows.map(row => ({
    ...row,
    purchaseTrend: row.purchaseOrderValue,
  }))

  // One unit for the whole axis, from the tallest bar it draws. Dividing every
  // tick by 1000 drew "0k" down the length of it for a shop turning over a few
  // thousand a day. No currency symbol: these axes have never carried one.
  const profitAxis = moneyAxisFormatter(
    Math.max(seriesPeak(chartRows, r => r.profitLoss), seriesPeak(chartRows, r => r.profitGoal)),
    { symbol: '', locale: 'en-US' },
  )
  const salesAxis = moneyAxisFormatter(
    Math.max(seriesPeak(chartRows, r => r.actualSales), seriesPeak(chartRows, r => r.salesGoal)),
    { symbol: '', locale: 'en-US' },
  )
  const purchaseTargetTotals = useMemo(() => purchaseTargetRows.reduce((totals, row) => ({
    target: totals.target + row.target,
    achieved: totals.achieved + row.achieved,
    remaining: totals.remaining + row.remaining,
  }), { target: 0, achieved: 0, remaining: 0 }), [purchaseTargetRows])

  function TableValue({ value, money = true, strong = false, tone }: { value: number; money?: boolean; strong?: boolean; tone?: 'green' | 'red' | 'blue' }) {
    const textTone = tone === 'green' ? 'text-brand-green' : tone === 'red' ? 'text-brand-red' : tone === 'blue' ? 'text-slate-700' : 'text-slate-700'
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
      <PageHeader
        title={t('nav_yearly')}
        subtitle="Purchase, Sales & Profit Overview"
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-slate-500">Year</span>
              <select className="min-w-[90px] bg-transparent outline-none" value={year} onChange={e => setYear(Number(e.target.value))}>
                {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              <CalendarDays size={16} className="text-slate-400" />
              {startLabel} - {endLabel}
            </div>
            {/* The time sits under the button rather than beside it - on the
                row it read as another control. */}
            <div className="flex flex-col items-center">
              <button onClick={loadData} className="btn-secondary h-10">
                <RefreshCw size={16} />
                Refresh
              </button>
              <span className="mt-1 text-[11px] font-medium text-slate-500">
                {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <NoValue />}
              </span>
            </div>
          </div>
        )}
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-5">
          {!hasYearData && (
            <div className="rounded-lg border border-brand-blue/30 bg-brand-blue-soft px-4 py-3 text-sm font-medium text-brand-blue">
              No yearly activity found for {year}. Targets can still appear if they were set in Settings.
            </div>
          )}

          {/* ── SECTION 01 — YEARLY OVERVIEW ────────────────────────────── */}
          {/* Same shape as the Monthly report: the period in one card, and the
              five figures that answer "how did it go" beside it. The twelve
              overview rows this page used to carry are gone - every one of
              them is either on a card here, in the Total row of the table
              below, or in the date range in the header. */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <PeriodCard
              label={String(year)}
              caption="Yearly Overview"
              salesPct={`${salesAchievedPct.toFixed(1)}%`}
              profitPct={`${profitAchievedPct.toFixed(1)}%`}
            />

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label="Sales Target Achievement"
                icon={<Target size={17} weight="duotone" />}
                value={formatCurr(summary.actualSales)}
                note={`${salesAchievedPct.toFixed(1)}% of ${formatCurr(summary.salesGoal)}`}
                progress={salesAchievedPct}
              />
              <KpiCard
                label="Profit Target Achievement"
                icon={<TrendingUp size={17} weight="duotone" />}
                value={formatCurr(profitAchieved)}
                note={`${profitAchievedPct.toFixed(1)}% of ${formatCurr(summary.profitGoal)}`}
                progress={profitAchievedPct}
              />
              {/* The two earnings that are neither sales nor a target, added
                  up. The parts stay readable underneath so nothing is lost by
                  showing them as one figure. */}
              <KpiCard
                label="Incentive + Other Income"
                icon={<WalletCards size={17} weight="duotone" />}
                value={formatCurr(summary.purchaseIncentive + summary.totalOtherIncome)}
                note={`Incentive ${formatCurr(summary.purchaseIncentive)} · Other ${formatCurr(summary.totalOtherIncome)}`}
                valueClassName="text-brand-green"
              />
              <KpiCard
                label="Total Expenses"
                icon={<ClipboardList size={17} weight="duotone" />}
                value={formatCurr(summary.totalExpenses)}
                note={`${pct(summary.totalExpenses, summary.actualSales).toFixed(2)}% of sales`}
                valueClassName="text-brand-red"
              />
              <KpiCard
                label="Profit / Loss"
                icon={<CheckCircle2 size={17} weight="duotone" />}
                value={formatCurr(summary.profitLoss)}
                note={`${summary.profitMargin.toFixed(2)}% net profit margin`}
                valueClassName={summary.profitLoss >= 0 ? 'text-navy-900' : 'text-brand-red'}
              />
            </div>
          </section>

          {/* ── SECTION 02 — THE PURCHASE RING AND THE TWO CHARTS ───────── */}
          {/* The ring on the side, then the two charts at half the row each.
              The ring shares this row rather than the table's because the
              table needs 1240px for its twelve columns and there is no width
              at which both it and a 370px card fit - beside the ring, the last
              two columns were only reachable by scrolling sideways. */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[370px_repeat(2,minmax(0,1fr))]">
            <PurchaseTargetDonut
              title="Yearly Purchases Target"
              target={purchaseTargetTotals.target}
              achieved={purchaseTargetTotals.achieved}
              rows={purchaseTargetRows}
              emptyNote="No purchase target for this year"
            />

            <div className="min-w-0 overflow-hidden rounded-lg border border-surface-border bg-surface shadow-sm">
              <div className="bg-slate-800 px-4 py-3 text-center">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Monthly Profit / Loss Trend</h2>
              </div>
              <p className="px-4 pt-3 text-center text-xs text-slate-500">
                Best {bestMonth ? monthShort(bestMonth.monthIndex) : '-'}: {formatCurr(bestMonth?.profitLoss || 0)}
              </p>
              <div className="px-2 py-4 sm:px-4">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartRows} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#D8DEE9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={profitAxis} axisLine={false} tickLine={false} width={46} />
                    <Tooltip formatter={(value: number) => formatCurr(value)} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 12 }} iconType="circle" iconSize={9} />
                    <Line type="monotone" dataKey="profitLoss" name="Profit / Loss" stroke={CHART_GREEN} strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="profitGoal" name="Profit Goal" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-lg border border-surface-border bg-surface shadow-sm">
              <div className="bg-slate-800 px-4 py-3 text-center">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Monthly Sales vs Goal</h2>
              </div>
              <p className="px-4 pt-3 text-center text-xs text-slate-500">
                Achieved {formatCurr(summary.actualSales)} of {formatCurr(summary.salesGoal)}
              </p>
              <div className="px-2 py-4 sm:px-4">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 4, bottom: 4 }} barCategoryGap="18%" barGap={1}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#D8DEE9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={salesAxis} axisLine={false} tickLine={false} width={46} />
                    <Tooltip formatter={(value: number) => formatCurr(value)} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 12 }} iconType="circle" iconSize={9} />
                    <Bar dataKey="actualSales" name="Sales Amount" fill="#0F1117" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="salesGoal" name="Sales Goal" fill={CHART_MUTED} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ── SECTION 03 — THE YEAR'S TABLE, FULL WIDTH ───────────────── */}
          {/* No tabs here: the Monthly report has five reports to choose
              between, this page has one table. It gets the whole width so all
              twelve columns are on screen - Profit Withdraw and Available
              Profit were the two that fell off the end. */}
          <section>
            {/* No title bar over this one. The table's own header row is
                already the site's near-black, and a second dark band directly
                above it only repeated what the columns say. */}
            <div className="min-w-0 overflow-hidden rounded-lg border border-surface-border bg-surface shadow-sm">
              <TableScroller className="overflow-x-auto">
                <table className="w-full min-w-[1240px] text-[11px]">
                  <thead className="table-header">
                    <tr>
                      <th className="sticky left-0 z-10 px-2 py-2.5 text-left text-[11px] tracking-normal">Month</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Sales Target</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Actual Sales</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Profit Target</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Sales Profit</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Others Income</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Incentive</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Total Profit</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Total Expense</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Profit and Loss</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Profit Withdraw</th>
                      <th className="px-2 py-2.5 text-right text-[11px] tracking-normal">Available Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* The year's own totals, on the first row where the Monthly
                        report puts them, rather than at the foot of twelve
                        months. */}
                    <tr className="bg-white font-black text-slate-900">
                      <td className="sticky left-0 bg-white px-2 py-2">Total</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.salesGoal)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.actualSales)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.profitGoal)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.totalProfit)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.totalOtherIncome)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.purchaseIncentive)}</td>
                      {/* Everything earned: sales profit, other income and the
                          supplier incentive - the same three businessEarnings
                          adds, so this less Total Expense is Profit and Loss. */}
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(businessEarnings(summaryProfitInputs(summary)))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.totalExpenses)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.profitLoss)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.profitWithdraw)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCurr(summary.availableProfit)}</td>
                    </tr>
                    {rows.map(row => (
                      <tr key={row.monthIndex} className="border-t border-slate-200 hover:bg-white/70">
                        <td className="sticky left-0 bg-surface px-2 py-2 font-medium text-slate-700">{monthName(row.monthIndex)}</td>
                        <TableValue value={row.salesGoal} />
                        <TableValue value={row.actualSales} tone="green" />
                        <TableValue value={row.profitGoal} />
                        <TableValue value={row.totalProfit} tone="green" />
                        <TableValue value={row.otherIncome} tone="green" />
                        <TableValue value={row.purchaseIncentive} tone="green" />
                        {/* Sales profit + other income + incentive, so this
                            month's row subtracts to its own Profit and Loss. */}
                        <TableValue value={businessEarnings(monthProfitInputs(row))} tone="green" strong />
                        <TableValue value={row.expenses} tone="red" />
                        <TableValue value={row.profitLoss} tone={row.profitLoss >= 0 ? 'green' : 'red'} />
                        <TableValue value={row.profitWithdraw} tone="red" />
                        <TableValue value={row.availableProfit} tone={row.availableProfit >= 0 ? 'green' : 'red'} strong />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroller>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
