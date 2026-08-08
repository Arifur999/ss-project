import { useCallback, useEffect, useRef, useState } from 'react'

// Renders a long list a slice at a time, growing as the reader scrolls.
//
// This is the counterpart to usePagedList, for tables where the fetching is
// not the problem but the drawing is. The page keeps every row in memory and
// every total, filter and export goes on working exactly as before - only the
// number of table rows the browser has to lay out changes.
//
// That distinction is the whole point. Moving a table's arithmetic to SQL is
// the right answer when the row count is unbounded, but it means transcribing
// the formula, and some of these formulas are chains of JavaScript fallbacks
// (`itemTotal || subtotal || net + discount`) where "0 is falsy" decides the
// answer. Getting one of those subtly wrong changes a money figure. Where the
// data is small enough to hold, rendering progressively costs nothing and
// cannot change a number.

export function useProgressiveRows<T>(
  rows: T[],
  { initial = 40, step = 40 }: { initial?: number; step?: number } = {}
) {
  const [visibleCount, setVisibleCount] = useState(initial)

  // Starts again from the top when the list actually changes - a new filter, a
  // search, fresh data. Without it, filtering down to five rows would leave the
  // count at several hundred and filtering back up would show them all at once.
  //
  // Keyed on the LENGTH, not the array. Most of these pages build their
  // filtered list inline, so the array is a new object on every render;
  // depending on it reset the count on every render, which meant scrolling to
  // eighty rows immediately snapped back to forty and the page thrashed
  // between the two. That churn is enough to make an open native date picker
  // unusable, which is how it was noticed.
  useEffect(() => {
    setVisibleCount(initial)
  }, [rows.length, initial])

  const visible = rows.length <= visibleCount ? rows : rows.slice(0, visibleCount)
  const hasMore = rows.length > visibleCount

  const showMore = useCallback(() => {
    setVisibleCount((current) => Math.min(current + step, rows.length))
  }, [step, rows.length])

  // Fires while the sentinel is still below the fold, so the next slice is
  // usually rendered before the reader reaches it.
  //
  // Reached through a ref so sentinelRef never changes identity - see the
  // longer note in usePagedList.ts. Depending on showMore rebuilt the observer
  // on every render, and a new observer reports straight away when its target
  // is already on screen, so it re-entered itself indefinitely.
  const observer = useRef<IntersectionObserver | null>(null)
  const showMoreRef = useRef(showMore)
  showMoreRef.current = showMore

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) return
    observer.current = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) showMoreRef.current() },
      { rootMargin: '600px' }
    )
    observer.current.observe(node)
  }, [])

  useEffect(() => () => observer.current?.disconnect(), [])

  return { visible, hasMore, visibleCount, total: rows.length, sentinelRef, showMore }
}
