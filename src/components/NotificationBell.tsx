import React, { useEffect, useRef, useState } from 'react'
import { BellIcon as Bell, MegaphoneIcon as Megaphone, XIcon as X } from '@phosphor-icons/react'
import { getMyNotifications, markNotificationsRead, type UserNotification } from '../services/notification.services'
import { formatDate } from '../lib/utils'

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
}

export default function NotificationBell() {
  const [items, setItems] = useState<UserNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<UserNotification | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  async function load() {
    try {
      const data = await getMyNotifications()
      setItems(data.items || [])
      setUnread(data.unread || 0)
    } catch {
      // silent - notifications are non-critical
    }
  }

  useEffect(() => {
    load()
    // Near-instant delivery: poll every 60s while the app is open.
    const timer = setInterval(load, 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  async function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      setUnread(0)
      setItems(current => current.map(n => ({ ...n, read: true })))
      try { await markNotificationsRead() } catch { /* ignore */ }
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={toggleOpen}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        title="Notifications"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <Megaphone size={28} className="text-slate-300" />
                <p className="text-sm text-slate-400">No notifications yet</p>
              </div>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { setSelected(n); setOpen(false) }}
                  className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-neutral-100"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                      <Megaphone size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 break-words text-xs text-slate-600">{n.message}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Full-message popup */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onMouseDown={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Megaphone size={16} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selected.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">{timeAgo(selected.created_at)}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-5">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{selected.message}</p>
            </div>
            <div className="border-t border-slate-100 p-4">
              <button onClick={() => setSelected(null)} className="btn-secondary w-full justify-center">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
