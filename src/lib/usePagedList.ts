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
  /**
   * True only when there is genuinely nothing to show - the very first load.
   * A search does NOT set this: the previous rows stay on screen until the new
   * ones arrive, because blanking a table on every keystroke reads as far
   * slower than it is, even when the server answers in three milliseconds.
   */
  loading: boolean
  /** True while a new search is in flight, with the old rows still shown. */
  searching: boolean
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
  // 200ms is long enough to collapse a burst of typing into one request and
  // short enough that the result feels like it followed the keystroke.
  { limit = 40, searchDelayMs = 200 }: { limit?: number; searchDelayMs?: number } = {}
): PagedList<T> {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Distinguishes "nothing has ever loaded" from "we have rows and are
  // fetching different ones".
  const hasLoadedOnce = useRef(false)
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

  // First page, and again whenever the search changes. Only the very first
  // load blanks the table; a search keeps the current rows until the new ones
  // land, so typing never leaves an empty screen.
  useEffect(() => {
    const id = ++requestId.current
    if (hasLoadedOnce.current) setSearching(true)
    else setLoading(true)
    setPage(1)
    loadRef.current({ page: 1, limit, search: activeSearch })
      .then((result) => {
        if (id !== requestId.current) return
        setItems(result.rows)
        setTotal(result.total)
        hasLoadedOnce.current = true
      })
      .finally(() => {
        if (id !== requestId.current) return
        setLoading(false)
        setSearching(false)
      })
  }, [activeSearch, limit])

  const hasMore = items.length < total

  // Belt and braces on top of the ref above: even with a stable observer, a
  // sentinel that stays on screen after a page is appended will report again
  // straight away. Without a floor between fetches that turns into a burst of
  // requests the moment a list is opened.
  const lastLoadAt = useRef(0)

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    const now = Date.now()
    if (now - lastLoadAt.current < 400) return
    lastLoadAt.current = now
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
  //
  // The callback is reached through a ref, and sentinelRef itself has NO
  // dependencies. That matters more than it looks: loadMore is rebuilt on
  // every render (it closes over page, loading, the search), so a sentinelRef
  // that depended on it changed identity every render too. React then called
  // the old ref with null and the new one with the node, which tore down the
  // observer and built a new one - and a fresh observer reports immediately if
  // its target is already on screen. That fired loadMore, which set state,
  // which re-rendered, which rebuilt the observer, which fired again. The
  // browser spent whole seconds fetching and parsing pages back to back, and
  // everything else - including a native date picker's hover - waited behind
  // it.
  const observer = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) return
    observer.current = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMoreRef.current() },
      { rootMargin: '600px' }
    )
    observer.current.observe(node)
  }, [])

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
    items, setItems, total, loading, searching, loadingMore, hasMore,
    search, setSearch: setSearchValue,
    sentinelRef, reload, patchItem, removeItems,
  }
}
