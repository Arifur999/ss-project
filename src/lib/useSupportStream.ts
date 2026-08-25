import { useEffect, useRef } from 'react'
import { API_BASE_URL } from './httpClient'

/**
 * Listens to the support conversation as it happens.
 *
 * This replaces a four-second poll, which was the wrong shape for a chat: it
 * is fine for "has anything changed today" and useless for a typing bubble,
 * which has to arrive before the message it announces or not at all.
 *
 * EventSource brings its own reconnection - a dropped connection is retried
 * without any code here - and carries the session cookie, which is how the
 * server knows whose conversations to send.
 */

export type SupportEvent =
  | { type: 'new'; ticket: any }
  | { type: 'update'; id: string; status: string; last_message_at: string; solved_at: string | null; solved_by: string | null; message?: any }
  | { type: 'typing'; id: string; from: 'admin' | 'customer' }

export function useSupportStream(onEvent: (event: SupportEvent) => void, onStatus?: (live: boolean) => void) {
  // Refs so a callback rebuilt on every render does not tear down the stream
  // and reconnect - which would drop messages and hammer the server.
  const handler = useRef(onEvent)
  handler.current = onEvent
  const status = useRef(onStatus)
  status.current = onStatus

  useEffect(() => {
    const source = new EventSource(`${API_BASE_URL}/support-tickets/stream`, { withCredentials: true })

    const parse = (type: SupportEvent['type']) => (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (type === 'new') handler.current({ type: 'new', ticket: data })
        else if (type === 'typing') handler.current({ type: 'typing', id: data.id, from: data.from })
        else handler.current({ ...data, type: 'update' })
      } catch {
        // A malformed frame is not worth tearing the stream down for.
      }
    }

    source.addEventListener('ready', () => status.current?.(true))
    source.addEventListener('ticket:new', parse('new') as EventListener)
    source.addEventListener('ticket:update', parse('update') as EventListener)
    source.addEventListener('ticket:typing', parse('typing') as EventListener)
    source.onerror = () => {
      // EventSource retries on its own; this only drives the "reconnecting"
      // line, so the reader knows the silence is the network and not us.
      status.current?.(false)
    }

    return () => source.close()
  }, [])
}

/**
 * How long a typing bubble stays up after the last keystroke arrives.
 *
 * The server pushes one event per heartbeat rather than a "stopped typing"
 * event, so the client forgets on a timer. Slightly longer than the client's
 * heartbeat gap, so a bubble does not flicker between two keystrokes.
 */
export const TYPING_CLEAR_MS = 3500
