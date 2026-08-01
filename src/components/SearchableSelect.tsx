import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export type SelectOption = { value: string; label: string }

// A native-select replacement that lets the user type to filter. Use for any
// dropdown that can hold many items (categories, products, accounts, people).
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  allowClear = true,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  allowClear?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className="input flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={selected ? 'truncate text-slate-800' : 'truncate text-slate-400'}>{selected ? selected.label : placeholder}</span>
        <span className="flex items-center gap-1">
          {allowClear && selected && (
            <X
              size={15}
              className="text-slate-400 hover:text-brand-red"
              onClick={e => { e.stopPropagation(); onChange('') }}
            />
          )}
          <ChevronDown size={16} className="text-slate-500" />
        </span>
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to search..."
              className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); setQuery('') }}
                className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50 ${o.value === value ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-700'}`}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-400">No matches</div>}
          </div>
        </div>
      )}
    </div>
  )
}
