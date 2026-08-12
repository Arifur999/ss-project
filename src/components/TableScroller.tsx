import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Wraps a wide table in a horizontal scroll container and shows ◄ ► buttons at
 * the top-right that scroll it — but only when the content actually overflows.
 * Helps owners scroll big tables without hunting for the scrollbar.
 *
 * Usage: replace `<div className="...scroll classes...">…</div>` around a table
 * with `<TableScroller className="...same scroll classes...">…</TableScroller>`.
 * If no className is given it defaults to `overflow-x-auto`.
 */
export default function TableScroller({ children, className = '', wrapClassName = '' }: { children: React.ReactNode; className?: string; wrapClassName?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      setCanLeft(el.scrollLeft > 4)
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const scrollBy = (direction: number) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' })
  }

  const overflowing = canLeft || canRight

  return (
    <div className={wrapClassName}>
      {overflowing && (
        <div className="mb-1.5 flex shrink-0 justify-end gap-1 px-1">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={!canLeft}
            aria-label="Scroll table left"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-neutral-100 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={!canRight}
            aria-label="Scroll table right"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-neutral-100 disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      <div ref={ref} className={className || 'overflow-x-auto'}>
        {children}
      </div>
    </div>
  )
}
