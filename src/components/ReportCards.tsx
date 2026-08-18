import React from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { useLang } from '../context/LanguageContext'
import StatCard from './StatCard'

/**
 * The pieces the Monthly and Yearly reports are built from.
 *
 * They live here rather than in either page because the two reports are meant
 * to be the same product seen at two zoom levels. Kept as a copy in each page,
 * the padding and the type sizes drift apart the first time one of them is
 * touched on its own.
 */

/**
 * The green the report charts draw with.
 *
 * Deliberately not `brand-green` (#22C55E). That one is a badge colour - it is
 * meant to catch the eye in a 20px pill, and at the size of a donut ring or a
 * column of bars the same value shouts. This is the same hue taken darker and
 * less saturated, so it sits beside the near-black bars rather than in front
 * of them. Only the charts use it; the badges keep theirs.
 */
export const CHART_GREEN = '#0E9F6E'

/**
 * The unfilled part of a ring, and the bar a target is drawn with.
 *
 * neutral-300 rather than neutral-200: the cards are #EEF0F6 now, and #E5E7EB
 * against that is close enough that a goal bar reads as empty space.
 */
export const CHART_MUTED = '#D1D5DB'

/**
 * The reports' name for the site's summary card.
 *
 * It is the shared StatCard - kept as a thin alias only because the report
 * pages read `label` and `note` where the rest of the site reads `title` and
 * `subtitle`. The card itself lives in one place.
 */
export function KpiCard({
  label,
  icon,
  value,
  note,
  progress,
  valueClassName,
}: {
  label: string
  icon: React.ReactNode
  value: string
  note?: string
  progress?: number
  valueClassName?: string
}) {
  return (
    <StatCard
      title={label}
      icon={icon}
      value={value}
      subtitle={note}
      progress={progress}
      valueClassName={valueClassName}
    />
  )
}

/**
 * The period's black title box with the two headline percentages under it.
 *
 * One card holds all three: the month or year in the sidebar's own black, and
 * a colour each for sales and profit so neither reads as the default.
 */
export function PeriodCard({
  label,
  caption,
  salesPct,
  profitPct,
}: {
  label: string
  caption: string
  salesPct: string
  profitPct: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-3">
      <div className="flex flex-1 flex-col justify-center rounded-xl bg-shell px-5 py-6">
        <p className="text-3xl font-bold leading-tight tracking-tight text-white">{label}</p>
        <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">{caption}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-brand-green-soft px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-green">Sales</p>
          <p className="mt-1 text-lg font-medium tabular-nums leading-none text-navy-900">{salesPct}</p>
        </div>
        <div className="rounded-xl bg-brand-blue-soft px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand-blue">Profit</p>
          <p className="mt-1 text-lg font-medium tabular-nums leading-none text-navy-900">{profitPct}</p>
        </div>
      </div>
    </div>
  )
}

export type PurchaseCompanyRow = {
  company: string
  target: number
  achieved: number
}

/**
 * How many companies the card names.
 *
 * The list used to run to whatever length the period produced, behind a
 * scrollbar, which made the card as tall as the report table beside it. Two is
 * what the owner reads: the rest are summed on one line so nothing is silently
 * dropped from a target report.
 */
const PURCHASE_COMPANY_LIMIT = 2

/**
 * How the buying went, as one ring.
 *
 * Top to bottom: who was bought from, then the ring, then the three figures.
 * The ring is capped at the target so a period that bought more than asked
 * still reads as a full circle rather than wrapping round - the percentage in
 * the middle is what carries "and then some".
 */
export function PurchaseTargetDonut({
  title,
  target,
  achieved,
  rows,
  emptyNote,
}: {
  title: string
  target: number
  achieved: number
  rows: PurchaseCompanyRow[]
  emptyNote: string
}) {
  const { formatCurr } = useLang()
  const remaining = Math.max(0, target - achieved)
  const percent = target > 0 ? (achieved / target) * 100 : 0
  const slices = [
    { name: 'Achieved', value: Math.min(achieved, target), fill: CHART_GREEN },
    { name: 'Remaining', value: remaining, fill: CHART_MUTED },
  ].filter(slice => slice.value > 0)

  // Biggest buyers first, so the two that are named are the two worth naming.
  const ranked = [...rows].sort((a, b) =>
    (b.achieved - a.achieved) || String(a.company || '').localeCompare(String(b.company || ''))
  )
  const listed = ranked.slice(0, PURCHASE_COMPANY_LIMIT)
  const rest = ranked.slice(PURCHASE_COMPANY_LIMIT)
  const restAchieved = rest.reduce((sum, row) => sum + Number(row.achieved || 0), 0)

  return (
    <div className="overflow-hidden rounded-lg border border-surface-border bg-surface shadow-sm">
      <div className="bg-slate-800 px-4 py-3 text-center">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">{title}</h2>
      </div>

      {target > 0 ? (
        <>
          {/* Who the buying went to, above the ring: the ring says how much of
              the target was met, this says by whom. */}
          {listed.length > 0 && (
            <div className="border-b border-slate-200">
              {listed.map(row => {
                const rowPct = row.target > 0 ? Math.round((row.achieved / row.target) * 100) : 0
                return (
                  <div
                    key={row.company}
                    className="flex items-center justify-between gap-2 px-4 py-2 text-[11px] hover:bg-white/70"
                    // The company's own target is what the percentage is of, and
                    // there is no room for it on the row - so it stays reachable
                    // here rather than being dropped.
                    title={`${row.company} · target ${formatCurr(row.target)}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{row.company}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{formatCurr(row.achieved)}</span>
                    <span className={`w-9 shrink-0 text-right font-bold tabular-nums ${rowPct >= 100 ? 'text-brand-green' : 'text-slate-500'}`}>{rowPct}%</span>
                  </div>
                )
              })}
              {/* What is not named is still counted, so the card never reads as
                  though these two were the whole month's buying. */}
              {rest.length > 0 && (
                <div className="flex items-center justify-between gap-2 px-4 py-2 text-[11px] text-slate-400">
                  <span className="min-w-0 flex-1 truncate">
                    {rest.length} more {rest.length === 1 ? 'company' : 'companies'}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatCurr(restAchieved)}</span>
                  <span className="w-9 shrink-0" />
                </div>
              )}
            </div>
          )}

          <div className="relative px-4 pt-5">
            <ResponsiveContainer width="100%" height={225}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  // A thin ring, not a filled wheel: at 13px the hole is wide
                  // enough to hold both lines of the label.
                  innerRadius={81}
                  outerRadius={94}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={remaining > 0 ? 2 : 0}
                  stroke="none"
                >
                  {slices.map(slice => <Cell key={slice.name} fill={slice.fill} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* The one figure this card exists to show. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-5">
              <p className="text-4xl font-black leading-none tracking-tight text-navy-900">{Math.round(percent)}%</p>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Purchase Achievement</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-slate-200 px-4 py-3 text-center">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Target</p>
              <p className="text-xs font-bold tabular-nums text-slate-800">{formatCurr(target)}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Actual</p>
              <p className="text-xs font-bold tabular-nums text-brand-green">{formatCurr(achieved)}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Remaining</p>
              <p className={`text-xs font-bold tabular-nums ${remaining > 0 ? 'text-brand-orange' : 'text-brand-green'}`}>{formatCurr(remaining)}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="px-4 py-14 text-center text-xs font-medium text-slate-400">{emptyNote}</p>
      )}
    </div>
  )
}
