import { useCallback, useEffect, useRef } from 'react'
import { LIVE_POLL_MS, shouldPoll, shouldSendHeartbeat } from './livePoll'
import { noteTyping } from '../services/support.services'

/**
 * Keeps a support conversation current without anybody pressing Refresh, and
 * tells the other side when you are writing.
 *
 * Both pages need exactly this, so it lives here rather than being written
 * twice and drifting.
 */
export function useLiveTickets(refresh: () => Promise<void> | void) {
  // Held in a ref so changing the callback each render does not restart the
  // timer - a poll that resets on every keystroke never fires.
  const latest = useRef(refresh)
  latest.current = refresh

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let running = false

    const tick = async () => {
      // Skip while a previous poll is still in flight: on a slow connection
      // the requests would otherwise stack up behind each other.
      if (running || !shouldPoll(document.visibilityState)) return
      running = true
      try {
        await latest.current()
      } catch {
        // A dropped poll is not worth a toast - the next one is 4 seconds away,
        // and a failing network would otherwise fill the screen with them.
      } finally {
        running = false
      }
    }

    const start = () => {
      if (timer) return
      timer = setInterval(tick, LIVE_POLL_MS)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }

    const onVisibility = () => {
      if (shouldPoll(document.visibilityState)) {
        // Catch up immediately rather than waiting out an interval: coming
        // back to the tab is exactly when somebody wants to see the reply.
        void tick()
        start()
      } else {
        stop()
      }
    }

    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}

/**
 * A throttled "still typing" heartbeat for the reply box.
 *
 * Returns a function to call on every change. One request per keystroke would
 * be dozens a sentence; the server holds the mark for longer than the gap, so
 * the other side's bubble stays lit regardless.
 */
export function useTypingHeartbeat(ticketId: string | null) {
  const lastSent = useRef(0)
  const lastTicket = useRef<string | null>(null)

  // Moving to another ticket must send at once rather than waiting out the
  // gap left by the previous conversation.
  if (lastTicket.current !== ticketId) {
    lastTicket.current = ticketId
    lastSent.current = 0
  }

  return useCallback(() => {
    if (!ticketId) return
    const now = Date.now()
    if (!shouldSendHeartbeat(lastSent.current, now)) return
    lastSent.current = now
    // Fire and forget: a dropped heartbeat costs a bubble, not a message.
    void noteTyping(ticketId).catch(() => {})
  }, [ticketId])
}
