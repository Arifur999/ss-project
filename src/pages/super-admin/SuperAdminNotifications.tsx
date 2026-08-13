import React, { useEffect, useState } from 'react'
import { MegaphoneIcon as Megaphone, ArrowsClockwiseIcon as RefreshCcw, PaperPlaneTiltIcon as Send, TrashIcon as Trash2, UsersIcon as Users } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import { confirmAction } from '../../components/ConfirmDialog'
import { formatDate } from '../../lib/utils'
import {
  deleteNotification,
  getAdminNotifications,
  sendNotification,
  type AdminNotification,
} from '../../services/notification.services'

export default function SuperAdminNotifications() {
  const [items, setItems] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setItems(await getAdminNotifications())
    } catch (error: any) {
      toast.error(error.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  async function send() {
    if (!title.trim()) return toast.error('Enter a title')
    if (!message.trim()) return toast.error('Enter a message')
    setSending(true)
    try {
      await sendNotification({ title: title.trim(), message: message.trim() })
      toast.success('Notification sent to all users')
      setTitle('')
      setMessage('')
      await load()
    } catch (error: any) {
      toast.error(error.message || 'Failed to send notification')
    } finally {
      setSending(false)
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({ title: 'Delete notification?', message: 'This will remove the notification for everyone. Continue?', confirmText: 'Yes, Delete', cancelText: 'Cancel' }))) return
    try {
      await deleteNotification(id)
      toast.success('Notification deleted')
      await load()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete notification')
    }
  }

  const day = (d: string) => {
    const parsed = new Date(d)
    if (isNaN(parsed.getTime())) return '-'
    return `${formatDate(parsed)} ${parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Notifications"
        subtitle="Send an announcement to every user's notification bell"
        actions={<button className="btn-secondary" onClick={load}><RefreshCcw size={16} /> Refresh</button>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Compose */}
        <div className="card h-fit">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900"><Megaphone size={18} /> New Notification</h2>
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="super-admin-notifications-f1">Title</label>
              <input id="super-admin-notifications-f1" className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance" maxLength={150} />
            </div>
            <div>
              <label className="label" htmlFor="super-admin-notifications-f2">Message</label>
              <textarea id="super-admin-notifications-f2" className="input min-h-[140px] resize-none leading-6" value={message} onChange={e => setMessage(e.target.value)} placeholder="Write your announcement..." maxLength={2000} />
              <p className="mt-1 text-right text-xs text-slate-400">{message.length}/2000</p>
            </div>
            <button onClick={send} disabled={sending} className="btn-primary w-full justify-center disabled:opacity-60">
              <Send size={16} /> {sending ? 'Sending...' : 'Send to all users'}
            </button>
          </div>
        </div>

        {/* Sent list */}
        <div className="card p-0">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-base font-bold text-slate-900">Sent Notifications</h2>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="py-10 text-center text-sm text-slate-400">Loading...</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">No notifications sent yet</div>
            ) : (
              items.map(n => (
                <div key={n.id} className="border-b border-slate-100 p-4 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{n.title}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{n.message}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>{day(n.created_at)}</span>
                        <span className="inline-flex items-center gap-1"><Users size={12} /> {n.read_count} read</span>
                      </div>
                    </div>
                    <button onClick={() => remove(n.id)} className="rounded-lg bg-red-50 p-1.5 text-red-500 hover:bg-red-100" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
