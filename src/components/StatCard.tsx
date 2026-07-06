import React from 'react'
import { cn } from '../lib/utils'

interface StatCardProps {
  title: string
  value: string
  icon?: React.ReactNode
  trend?: number
  color?: 'green' | 'red' | 'blue' | 'orange' | 'default'
  subtitle?: string
}

const colorMap = {
  green: 'bg-green-50 text-brand-green',
  red: 'bg-red-50 text-brand-red',
  blue: 'bg-blue-50 text-blue-600',
  orange: 'bg-orange-50 text-orange-600',
  default: 'bg-slate-50 text-slate-600',
}

export default function StatCard({ title, value, icon, trend, color = 'default', subtitle }: StatCardProps) {
  return (
    <div className="card min-w-0 transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1 break-words tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          {trend !== undefined && (
            <div className={cn('flex items-center gap-1 mt-1 text-xs font-medium', trend >= 0 ? 'text-brand-green' : 'text-brand-red')}>
              <span>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', colorMap[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
