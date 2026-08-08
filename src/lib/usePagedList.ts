import React, { useCallback, useEffect, useRef, useState } from 'react'

// Loads a list a page at a time and appends as the reader scrolls.
//
// The point is that the browser never holds the whole table. At three thousand
// rows sending everything was merely slow; at ten thousand it stops working -
// the payload, the parse, and the DOM nodes all scale with it, and none of
// that is fixed by a faster server.
//
// Searching goes to the server too, because a search has to look at every row,
// not just the ones already fetched. The debounce is there so typing does not
// fire a request per keystroke.
//
// The loader is handed page and search and returns the rows plus the total, so
// the caller keeps whatever query shape it already had. `total` is what a page
// shows as its record count - it comes from the server, so it stays right even
// though only part of the list is in memory.

export type PagedResult<T> = { rows: T[]; total: number }

export type PagedList<T> = {
  /** Rows loaded so far - page 1 up to whatever scrolling has reached. */
  items: T[]
  /**
   * Direct access, for the optimistic updates a page does after a save so the
   * new row appears without waiting for a refetch. Adding a row this way does
   * not change `total`; call reload() when the count has to be exact.
   */
  setItems: React.Dispatch<React.SetStateAction<T[]>>
  /** Every matching row on the server, not just the loaded ones. */
  total: number
  /** True during the very first load, when there is nothing to show yet. */
  loading: boolean
  /** True while a further page is being appended. */
  loadingMore: boolean
  hasMore: boolean
  search: string
  setSearch: (value: string) => void
  /** Attach to a sentinel element at the end of the list. */
  sentinelRef: (node: HTMLElement | null) => void
  /** Re-read from page 1 - call after a save or delete. */
  reload: () => void
  /** Replace a row in place without a round trip. */
  patchItem: (id: string, changes: Partial<T>) => void
  /** Drop rows locally after a delete, so the list does not flicker. */
  removeItems: (ids: string[]) => void
}

export function usePagedList<T extends { id: string }>(
  load: (options: { page: number; limit: number; search: string }) => Promise<PagedResult<T>>,
  { limit = 40, searchDelayMs = 350 }: { limit?: number; searchDelayMs?: number } = {}
): PagedList<T> {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearchValue] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [page, setPage] = useState(1)

  // Every fetch carries the id of the request that started it. A slow page 1
  // landing after a fast page 2 would otherwise overwrite it, and a stale
  // search would overwrite a newer one.
  const requestId = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    const timer = setTimeout(() => setActiveSearch(search.trim()), searchDelayMs)
    return () => clearTimeout(timer)
  }, [search, searchDelayMs])

  // First page, and again whenever the search changes.
  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    setPage(1)
    loadRef.current({ page: 1, limit, search: activeSearch })
      .then((result) => {
        if (id !== requestId.current) return
        setItems(result.rows)
        setTotal(result.total)
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [activeSearch, limit])

  const hasMore = items.length < total

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    const next = page + 1
    const id = ++requestId.current
    setLoadingMore(true)
    loadRef.current({ page: next, limit, search: activeSearch })
      .then((result) => {
        if (id !== requestId.current) return
        // Guard against a page arriving twice: the sentinel can fire again
        // before the state has settled.
        setItems((current) => {
          const seen = new Set(current.map((row) => row.id))
          return [...current, ...result.rows.filter((row) => !seen.has(row.id))]
        })
        setTotal(result.total)
        setPage(next)
      })
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false)
      })
  }, [loading, loadingMore, hasMore, page, limit, activeSearch])

  // Fires while the sentinel is still below the fold, so the next page is
  // usually there before the reader arrives at the end.
  const observer = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect()
    if (!node) return
    observer.current = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore() },
      { rootMargin: '600px' }
    )
    observer.current.observe(node)
  }, [loadMore])

  useEffect(() => () => observer.current?.disconnect(), [])

  const reload = useCallback(() => {
    const id = ++requestId.current
    setLoading(true)
    setPage(1)
    loadRef.current({ page: 1, limit, search: activeSearch })
      .then((result) => {
        if (id !== requestId.current) return
        setItems(result.rows)
        setTotal(result.total)
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [limit, activeSearch])

  const patchItem = useCallback((id: string, changes: Partial<T>) => {
    setItems((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)))
  }, [])

  const removeItems = useCallback((ids: string[]) => {
    const drop = new Set(ids)
    setItems((current) => current.filter((row) => !drop.has(row.id)))
    setTotal((current) => Math.max(0, current - ids.length))
  }, [])

  return {
    items, setItems, total, loading, loadingMore, hasMore,
    search, setSearch: setSearchValue,
    sentinelRef, reload, patchItem, removeItems,
  }
}
