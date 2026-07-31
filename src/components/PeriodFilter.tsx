import React from 'react'
import { Printer } from 'lucide-react'
import type { Period } from '../lib/periodFilter'

// Reusable toolbar: All / This Month / This Year / Custom (date-to-date) plus an
// optional Print button. Used on the list pages (Invest, Profit, Transfer, ...).
export default function PeriodFilter({
  period, setPeriod, from, setFrom, to, setTo, onPrint,
}: {
  period: Period
  setPeriod: (p: Period) => void
  from: string
  setFrom: (v: string) => void
  to: string
  setTo: (v: string) => void
  onPrint?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="input min-w-[130px] max-w-[160px]" title="Period">
        <option value="all">All Time</option>
        <option value="month">This Month</option>
        <option value="year">This Year</option>
        <option value="custom">Custom Range</option>
      </select>
      {period === 'custom' && (
        <>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input min-w-[140px] max-w-[170px]" title="From date" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input min-w-[140px] max-w-[170px]" title="To date" />
        </>
      )}
      {onPrint && (
        <button type="button" onClick={onPrint} className="btn-secondary !px-3 !py-2 text-sm" title="Print">
          <Printer size={16} /> Print
        </button>
      )}
    </div>
  )
}
