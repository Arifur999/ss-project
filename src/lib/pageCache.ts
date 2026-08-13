// Tiny localStorage-backed cache so heavy dashboard pages can paint their
// last-known data instantly instead of showing a blank spinner for the
// seconds it takes to refetch (the backend is far away + each page fires many
// full-table requests). Pages read the cache on mount, render it immediately,
// then refetch in the background and overwrite the cache with fresh data.
//
// This is display-acceleration only - never a source of truth. Values are
// briefly stale until the background refetch completes.

// The version is part of the key on purpose. A cached object is only ever
// valid for the code that wrote it, so when a page changes the shape of what
// it stores, this number goes up and every older entry stops being read
// instead of being handed to code that expects new fields. Getting this wrong
// crashed the dashboard for everyone who had used it before the change:
// monthlyCashflow did not exist in the stored object, and .map on undefined
// throws before anything renders.
const PREFIX = 'page_cache_v2:'

export function readPageCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writePageCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Quota/serialization errors are non-fatal - the cache is best-effort.
  }
}
