import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getAllSupportTickets, getMySupportTickets, type SupportTicket } from '../services/support.services'
import { awaitingReplyCount, readSeen, unreadReplyCount } from './supportUnread'
import { useSupportStream } from './useSupportStream'

/**
 * The number beside "Support" in the sidebar.
 *
 * It lives in the sidebar rather than on the support page, because the whole
 * point is to be seen by somebody who is not on that page - an owner who has
 * just signed in, or an admin working through Payments who would otherwise
 * leave a customer waiting all afternoon.
 *
 * It rides the same live stream the conversations use, so a message arriving
 * lights the sidebar at once rather than on the next page load.
 */
export function useSupportBadge(): number {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'super_admin'
  const userId = profile?.id || null
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [seen, setSeen] = useState(() => readSeen(userId))

  const load = useCallback(async () => {
    if (!profile) return
    try {
      setTickets(isAdmin ? await getAllSupportTickets() : await getMySupportTickets())
    } catch {
      // A sidebar badge is not worth a toast, and the support pages report
      // their own failures loudly enough.
    }
  }, [profile, isAdmin])

  useEffect(() => { void load() }, [load])

  // The page marks a conversation read by writing to the same store, so the
  // badge has to notice. Cheap: reading it is one localStorage hit.
  useEffect(() => {
    if (isAdmin) return
    const refresh = () => setSeen(readSeen(userId))
    window.addEventListener('support-seen', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('support-seen', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [userId, isAdmin])

  useSupportStream(event => {
    if (event.type === 'typing') return
    if (event.type === 'new') {
      setTickets(prev => (prev.some(t => t.id === event.ticket.id) ? prev : [event.ticket, ...prev]))
      return
    }
    setTickets(prev => {
      const known = prev.some(t => t.id === event.id)
      // A ticket this browser has never listed - opened in another tab, say.
      // Refetching is simpler than half-building a row from an update event.
      if (!known) { void load(); return prev }
      return prev.map(t => (t.id === event.id
        ? { ...t, status: event.status as SupportTicket['status'], last_message_at: event.last_message_at }
        : t))
    })
  })

  return isAdmin ? awaitingReplyCount(tickets) : unreadReplyCount(tickets, seen)
}

/**
 * Told when a conversation has been read, so the sidebar can drop its count
 * without either side knowing about the other.
 */
export const announceSeen = (): void => {
  window.dispatchEvent(new Event('support-seen'))
}
