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
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
      <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="input h-10 w-auto shrink-0" title="Period">
        <option value="all">All Time</option>
        <option value="month">This Month</option>
        <option value="year">This Year</option>
        <option value="custom">Custom Range</option>
      </select>
      {period === 'custom' && (
        <>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input h-10 w-auto shrink-0" title="From date" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input h-10 w-auto shrink-0" title="To date" />
        </>
      )}
      {onPrint && (
        <button type="button" onClick={onPrint} className="btn-secondary h-10 shrink-0 whitespace-nowrap !px-3 text-sm" title="Print">
          <Printer size={16} /> Print
        </button>
      )}
    </div>
  )
}
