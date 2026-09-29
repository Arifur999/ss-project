import React, { useEffect, useMemo, useState } from 'react'
import { WrenchIcon as Wrench, PackageIcon as Package, CoinsIcon as Coins, TrashIcon as Trash } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import PeriodFilter from '../../components/PeriodFilter'
import StatCard from '../../components/StatCard'
import TableScroller from '../../components/TableScroller'
import TableSkeleton from '../../components/TableSkeleton'
import { NoValue } from '../../components/CellValue'
import { formatDate } from '../../lib/utils'
import { inPeriod, type Period } from '../../lib/periodFilter'
import { useLang } from '../../context/LanguageContext'
import { getDamageEntries, getDamageTransactions, type DamageEntry } from '../../services/damage.services'
import { ACTION_LABELS, outstandingQty, SOURCE_LABELS, STATUS_BADGE, STATUS_LABELS } from './damageRules'

/**
 * What damage is costing, at a glance.
 *
 * The figure worth having is the last one: paid out for repairs, less what
 * suppliers paid back, plus what was written off. Nothing in the app could
 * work it out before, because the goods that left stock were never valued.
 */
export default function DamageDashboard() {
  const { formatCurr, formatNum } = useLang()

  const [entries, setEntries] = useState<DamageEntry[]>([])
  const [money, setMoney] = useState<{ paidOut: number; cameIn: number; writtenOff: number }>({ paidOut: 0, cameIn: 0, writtenOff: 0 })
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [entryRows, transactions] = await Promise.all([getDamageEntries(), getDamageTransactions()])
      setEntries(entryRows || [])

      // A write-off carries no account; a repair paid in cash does. That is
      // the only thing separating the two on the expense side, and it is the
      // same rule the Balance Dashboard reads them by.
      const expenses = transactions.expenses as Array<Record<string, unknown>>
      setMoney({
        paidOut: expenses.filter(row => row.account_id).reduce((sum, row) => sum + Number(row.amount || 0), 0),
        writtenOff: expenses.filter(row => !row.account_id).reduce((sum, row) => sum + Number(row.amount || 0), 0),
        cameIn: (transactions.other_incomes as Array<Record<string, unknown>>)
          .reduce((sum, row) => sum + Number(row.amount || 0), 0),
      })
    } catch (error: any) {
      toast.error(error?.message || 'Could not load the damage dashboard')
    } finally {
      setLoading(false)
    }
  }

  const inRange = useMemo(
    () => entries.filter(entry => inPeriod(String(entry.date || ''), period, fromDate, toDate)),
    [entries, period, fromDate, toDate]
  )

  const stats = useMemo(() => {
    let pieces = 0
    let valueOut = 0
    let stillOut = 0
    for (const entry of inRange) {
      for (const item of entry.damage_items) {
        pieces += Number(item.qty || 0)
        valueOut += Number(item.total_cost || 0)
        stillOut += outstandingQty(item)
      }
    }
    return { pieces, valueOut, stillOut }
  }, [inRange])

  const netCost = money.paidOut + money.writtenOff - money.cameIn

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Damage Dashboard"
        subtitle="What broke, what came back, and what it cost"
        actions={
          <PeriodFilter period={period} setPeriod={setPeriod} from={fromDate} setFrom={setFromDate} to={toDate} setTo={setToDate} />
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Pieces damaged" value={formatNum(stats.pieces)} subtitle="in this period" icon={<Wrench size={20} />} color="orange" />
        <StatCard title="Value off the shelf" value={formatCurr(stats.valueOut)} subtitle="at what it cost, not list price" icon={<Package size={20} />} color="blue" />
        <StatCard title="Still out" value={formatNum(stats.stillOut)} subtitle="not back yet" icon={<Package size={20} />} color="orange" />
        <StatCard
          title="Net cost of damage"
          value={formatCurr(netCost)}
          subtitle="repairs + write-offs, less refunds"
          icon={<Coins size={20} />}
          color={netCost > 0 ? 'red' : 'green'}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-xs text-slate-500">Repairs paid</p><p className="mt-1 text-xl font-bold text-brand-red">{formatCurr(money.paidOut)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Written off</p><p className="mt-1 text-xl font-bold text-brand-red">{formatCurr(money.writtenOff)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Recovered from suppliers</p><p className="mt-1 text-xl font-bold text-brand-green">{formatCurr(money.cameIn)}</p></div>
      </div>

      <div className="card p-0">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-bold text-slate-900">Latest entries</h2>
        </div>
        <TableScroller>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">Doc No</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Products</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {inRange.slice(0, 10).map(entry => (
                <tr key={entry.id} className="table-row">
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">{entry.doc_no}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(entry.date)}</td>
                  <td className="px-4 py-2.5">
                    <p className="max-w-[18rem] truncate" title={entry.damage_items.map(item => item.product_name).join(', ')}>
                      {entry.damage_items.map(item => item.product_name).join(', ') || <NoValue />}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{SOURCE_LABELS[entry.source]}</td>
                  <td className="px-4 py-2.5 text-slate-600">{ACTION_LABELS[entry.action]}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-800">
                    {formatCurr(entry.damage_items.reduce((sum, item) => sum + Number(item.total_cost || 0), 0))}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[entry.status]}`}>
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {loading && <TableSkeleton rows={5} cols={7} />}
              {!loading && inRange.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <Trash size={34} className="mx-auto mb-2 opacity-40" />
                    Nothing damaged in this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroller>
      </div>
    </div>
  )
}
