// Tiny localStorage-backed cache so heavy dashboard pages can paint their
// last-known data instantly instead of showing a blank spinner for the
// seconds it takes to refetch (the backend is far away + each page fires many
// full-table requests). Pages read the cache on mount, render it immediately,
// then refetch in the background and overwrite the cache with fresh data.
//
// This is display-acceleration only - never a source of truth. Values are
// briefly stale until the background refetch completes.

const PREFIX = 'page_cache_v1:'

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
