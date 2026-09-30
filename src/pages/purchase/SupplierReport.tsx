import React, { useEffect, useMemo, useState } from 'react'
import { ArrowsClockwiseIcon as RefreshCw, PrinterIcon as Printer } from '@phosphor-icons/react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import TableSkeleton, { BlockSkeleton } from '../../components/TableSkeleton'
import { ZeroAmount } from '../../components/CellValue'
import { CHART_GREEN } from '../../components/ReportCards'
import { supabase } from '../../lib/supabase'
import { moneyAxisFormatter, seriesPeak } from '../../lib/chartAxis'
import { supplierYearlyPurchase } from '../../lib/supplierYearlyPurchase'
import { printTable } from '../../lib/printTable'
import { useLang } from '../../context/LanguageContext'

// The primary series colour the Yearly report uses for "actual", against which
// CHART_GREEN reads as the money that moved.
const SERIES_DARK = '#0F1117'

/**
 * A year of buying, month by month - the sheet the owner has kept by hand.
 *
 * Every figure here already existed in the app and had no screen: YearlyReport
 * computes order value, incentive and deposit per month and renders only the
 * incentive. What is genuinely new is the last column, what actually reached
 * the supplier, which needs the two payment channels added together.
 *
 * The arithmetic is lib/supplierYearlyPurchase.ts, where it is tested. This
 * page fetches a year, holds the rows, and hands the same derived array to the
 * chart, the twelve rows and the total - so they cannot disagree about a month.
 */
export default function SupplierReport() {
  const { formatCurr, monthShort } = useLang()

  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [supplierFilter, setSupplierFilter] = useState('')
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [purchases, setPurchases] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // The same eleven-year window the Yearly report offers, so the two Year
  // selects on the site never disagree about which years exist. Deriving them
  // from the data would mean an unbounded purchases fetch on every page open.
  const yearOptions = useMemo(
    () => Array.from({ length: 11 }, (_, index) => thisYear - 5 + index).reverse(),
    [thisYear]
  )

  useEffect(() => { void loadData() }, [year])

  async function loadData() {
    try {
      setLoading(true)
      const start = `${year}-01-01`
      const end = `${year}-12-31`
      const [purchaseRes, paymentRes, supplierRes] = await Promise.all([
        supabase
          .from('purchases')
          .select('date, supplier_id, paid_amount, total_amount, net_amount, purchase_items(*)')
          .gte('date', start).lte('date', end),
        supabase
          .from('supplier_payments')
          .select('date, supplier_id, amount')
          .gte('date', start).lte('date', end),
        supabase.from('suppliers').select('id, name, company_name').eq('is_active', true).order('company_name'),
      ])
      if (purchaseRes.error) throw purchaseRes.error
      if (paymentRes.error) throw paymentRes.error
      if (supplierRes.error) throw supplierRes.error

      setPurchases(purchaseRes.data || [])
      setPayments(paymentRes.data || [])
      setSuppliers(supplierRes.data || [])
    } catch (error: any) {
      toast.error(error?.message || 'Could not load the purchase report')
    } finally {
      setLoading(false)
    }
  }

  // One derived object behind the chart, the rows and the total. Changing the
  // supplier recomputes it and fetches nothing.
  const report = useMemo(
    () => supplierYearlyPurchase({ year, supplierId: supplierFilter, purchases, payments }),
    [year, supplierFilter, purchases, payments]
  )

  const chartRows = useMemo(
    () => report.months.map(row => ({
      month: monthShort(row.monthIndex),
      orderValue: row.orderValue,
      depositPaid: row.depositPaid,
    })),
    [report, monthShort]
  )

  // Scaled to what is on screen, so one small supplier's bars fill the chart
  // instead of lying flat against the all-suppliers peak.
  const axis = useMemo(
    () => moneyAxisFormatter(
      Math.max(seriesPeak(chartRows, row => row.orderValue), seriesPeak(chartRows, row => row.depositPaid)),
      { symbol: '', locale: 'en-US' }
    ),
    [chartRows]
  )

  const hasYearData = report.months.some(row => row.orderValue || row.depositPaid || row.incentive)
  const supplierName = supplierFilter
    ? (() => {
      const found = suppliers.find(row => row.id === supplierFilter)
      return found ? (found.company_name || found.name) : 'this supplier'
    })()
    : 'All suppliers'

  // The same five columns and the same total, on paper. printTable is the
  // house printer for a list page: it opens a window, writes a clean table and
  // calls print. The incentive keeps its minus sign, because a column headed
  // "- Incentive" that prints a bare number reads as an addition.
  function printReport() {
    const signed = (value: number) => (value === 0 ? '0' : `-${formatCurr(value)}`)
    printTable({
      title: 'Yearly Purchase Overview',
      subtitle: `${supplierName} · ${year}`,
      columns: [
        { label: 'Month' },
        { label: 'Total Order Value', align: 'right' },
        { label: '- Incentive', align: 'right' },
        { label: 'Actual Deposit Amount', align: 'right' },
        { label: 'Deposit Amount', align: 'right' },
      ],
      rows: report.months.map(row => [
        monthShort(row.monthIndex),
        formatCurr(row.orderValue),
        signed(row.incentive),
        formatCurr(row.actualDeposit),
        formatCurr(row.depositPaid),
      ]),
      totalRow: [
        'Total',
        formatCurr(report.total.orderValue),
        signed(report.total.incentive),
        formatCurr(report.total.actualDeposit),
        formatCurr(report.total.depositPaid),
      ],
    })
  }

  const money = (value: number) => (value === 0 ? <ZeroAmount /> : formatCurr(value))

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Yearly Purchase Overview"
        subtitle={`${supplierName} · ${year}`}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Both filters sit here rather than on the table, because the
                supplier one changes the chart as well as the rows. */}
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-slate-500">Supplier</span>
              <select
                className="min-w-[150px] bg-transparent outline-none"
                value={supplierFilter}
                onChange={event => setSupplierFilter(event.target.value)}
              >
                <option value="">All Supplier</option>
                {suppliers.map(row => (
                  <option key={row.id} value={row.id}>{row.company_name || row.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              <span className="text-[11px] font-bold uppercase text-slate-500">Year</span>
              <select
                className="min-w-[80px] bg-transparent outline-none"
                value={year}
                onChange={event => setYear(Number(event.target.value))}
              >
                {yearOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <button onClick={loadData} className="btn-secondary h-10" title="Reload this year">
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              onClick={printReport}
              className="btn-secondary h-10"
              disabled={loading}
              title="Print this table"
              aria-label="Print this table"
            >
              <Printer size={16} /> Print
            </button>
          </div>
        )}
      />

      {!loading && !hasYearData && (
        <div className="mb-4 rounded-lg bg-brand-blue-soft px-4 py-3 text-sm font-medium text-brand-blue">
          Nothing was bought from {supplierName.toLowerCase() === 'all suppliers' ? 'anybody' : supplierName} in {year}.
        </div>
      )}

      <div className="mb-4 overflow-hidden rounded-lg border border-surface-border bg-surface shadow-sm">
        <div className="bg-slate-800 px-4 py-3 text-center">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Ordered against Paid</h2>
        </div>
        <div className="p-3">
          {loading ? <BlockSkeleton height="h-72" /> : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 4, bottom: 4 }} barCategoryGap="18%" barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D8DEE9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={axis} width={46} />
                <Tooltip formatter={(value: any) => formatCurr(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 12 }} iconType="circle" iconSize={9} />
                <Bar dataKey="orderValue" name="Order Value" fill={SERIES_DARK} radius={[3, 3, 0, 0]} />
                <Bar dataKey="depositPaid" name="Paid" fill={CHART_GREEN} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <TableScroller wrapClassName="overflow-hidden rounded-lg border border-surface-border bg-surface shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left">Month</th>
              <th className="px-4 py-3 text-right">Total Order Value</th>
              <th className="px-4 py-3 text-right">- Incentive</th>
              <th className="px-4 py-3 text-right">Actual Deposit Amount</th>
              <th className="px-4 py-3 text-right">Deposit Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeleton rows={12} cols={5} />}
            {!loading && report.months.map(row => (
              <tr key={row.monthIndex} className="table-row">
                <td className="px-4 py-2.5 font-medium text-slate-700">{monthShort(row.monthIndex)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">{money(row.orderValue)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-brand-red">
                  {row.incentive === 0 ? <ZeroAmount /> : `-${formatCurr(row.incentive)}`}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{money(row.actualDeposit)}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-brand-green">{money(row.depositPaid)}</td>
              </tr>
            ))}
            {/* At the foot, because this page reproduces a sheet that totals
                at the bottom. */}
            {!loading && (
              <tr className="border-t-2 border-slate-300 bg-white font-black text-slate-900">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(report.total.orderValue)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-red">
                  {report.total.incentive === 0 ? <ZeroAmount /> : `-${formatCurr(report.total.incentive)}`}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{money(report.total.actualDeposit)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-brand-green">{money(report.total.depositPaid)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroller>
    </div>
  )
}
