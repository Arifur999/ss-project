import React from 'react'
import { cn } from '../lib/utils'

interface StatCardProps {
  title: string
  // A node, not a string: a card whose figure has not arrived shows the
  // "no value" marker in place of the number.
  value: React.ReactNode
  icon?: React.ReactNode
  trend?: number
  color?: 'green' | 'red' | 'blue' | 'orange' | 'default'
  subtitle?: string
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

export default function StatCard({ title, value, icon, trend, color = 'default', subtitle }: StatCardProps) {
  return (
    <div className="card min-w-0 transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">{title}</p>
          <p className="mt-4 break-words text-xl font-medium tracking-tight tabular-nums text-navy-900 sm:text-2xl">{value}</p>
          {subtitle && <p className="mt-1.5 text-xs text-neutral-500">{subtitle}</p>}
          {trend !== undefined && (
            <div className={cn('mt-1.5 flex items-center gap-1 text-xs font-semibold', trend >= 0 ? 'text-brand-green' : 'text-brand-red')}>
              <span>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={cn('w-10 h-10 rounded-full bg-white border border-surface-border flex items-center justify-center flex-shrink-0', colorMap[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
