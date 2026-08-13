import { lazy, type ComponentType } from 'react'

/**
 * React.lazy that survives a deploy happening under an open tab.
 *
 * Every page is its own file, named with a content hash, and the deploy copies
 * the new build with `rsync --delete` - so the moment it finishes, the files
 * the open tab knows about are gone. The next navigation asks for a chunk that
 * no longer exists, the import rejects, and with nothing catching it the whole
 * app unmounts and the browser shows white. That is the "sometimes the page
 * goes blank" that only ever happens to whoever was already using the site.
 *
 * A reload is the actual fix: it fetches index.html again, which names the new
 * chunks. This does that once, remembering in sessionStorage so a genuinely
 * broken import cannot put the tab in a reload loop - the second failure falls
 * through to the error boundary, which explains itself.
 */
const RELOADED_KEY = 'chunk_reloaded_at'
const RELOAD_WINDOW_MS = 10_000

export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (error) {
      const lastReload = Number(sessionStorage.getItem(RELOADED_KEY) || 0)
      const reloadedJustNow = Date.now() - lastReload < RELOAD_WINDOW_MS

      if (!reloadedJustNow) {
        sessionStorage.setItem(RELOADED_KEY, String(Date.now()))
        window.location.reload()
        // Never resolves; the reload replaces this document.
        return await new Promise<{ default: T }>(() => {})
      }

      // Reloading did not help, so this is not a stale chunk. Let it through to
      // the error boundary rather than reloading again.
      throw error
    }
  })
}
