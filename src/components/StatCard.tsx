import React from 'react'
import { cn } from '../lib/utils'

/**
 * The site's one summary card.
 *
 * Its shape is the root dashboard's - a white circular icon tile beside the
 * label, the figure below it, and a fixed 124px floor so a row of them lines
 * up whether or not each has a note underneath. Every page that shows a row of
 * figures draws from here, so the padding and the rhythm are set once rather
 * than being re-invented per page: before this there were four of these, at
 * three different heights, with the icon on the left on one page and the right
 * on the next.
 */
interface StatCardProps {
  title: string
  // A node, not a string: a card whose figure has not arrived shows the
  // "no value" marker in place of the number.
  value: React.ReactNode
  icon?: React.ReactNode
  trend?: number
  color?: 'green' | 'red' | 'blue' | 'orange' | 'default'
  subtitle?: string
  /** Colours the figure itself; the default near-black suits most cards. */
  valueClassName?: string
  /** 0-100. Draws the bar the target cards use. */
  progress?: number
  /** Anything that belongs under the figure - the dashboard's trend line. */
  footer?: React.ReactNode
}

// green/red stay as money semantics; blue/orange are re-pointed to neutral
// slate so non-financial stat chips read monochrome with the reference.
// The circle behind the icon is always white now, so this only tints the
// glyph - a coloured fill would cover the white the reference relies on.
const colorMap = {
  green: 'text-brand-green',
  red: 'text-brand-red',
  blue: 'text-neutral-700',
  orange: 'text-neutral-700',
  default: 'text-neutral-700',
}

export default function StatCard({
  title,
  value,
  icon,
  trend,
  color = 'default',
  subtitle,
  valueClassName = 'text-navy-900',
  progress,
  footer,
}: StatCardProps) {
  return (
    <section className="card flex min-h-[124px] min-w-0 flex-col justify-between p-5">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-surface-border bg-white', colorMap[color])}>
            {icon}
          </span>
        )}
        <span className="truncate text-sm text-neutral-700" title={title}>{title}</span>
      </div>

      <p className={cn('mt-4 break-words text-2xl font-medium leading-none tracking-tight tabular-nums', valueClassName)}>
        {value}
      </p>

      <div className="mt-2 space-y-1.5">
        {subtitle && <p className="truncate text-[11px] text-neutral-500" title={subtitle}>{subtitle}</p>}
        {progress !== undefined && (
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full rounded-full bg-navy-900" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        )}
        {trend !== undefined && (
          <div className={cn('flex items-center gap-1 text-xs font-semibold', trend >= 0 ? 'text-brand-green' : 'text-brand-red')}>
            <span>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%</span>
          </div>
        )}
        {footer}
      </div>
    </section>
  )
}
