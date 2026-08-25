import React, { useEffect, useMemo, useState } from 'react'
import {
  CheckCircleIcon as CheckCircle2,
  ChatCircleTextIcon as MessageCircle,
  PaperPlaneTiltIcon as Send,
  ArrowsClockwiseIcon as RefreshCcw,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { confirmAction } from '../../components/ConfirmDialog'
import { NoValue } from '../../components/CellValue'
import TypingBubble from '../../components/TypingBubble'
import { useLiveTickets, useTypingHeartbeat } from '../../lib/useLiveTickets'
import { formatDate } from '../../lib/utils'
import { askerName, awaitingCount, sortInbox, statusClass, statusLabel, waitedFor } from '../../lib/supportInbox'
import {
  getAllSupportTickets,
  markSupportTicketSolved,
  replyToSupportTicket,
  type SupportTicket,
  type SupportTicketStatus,
} from '../../services/support.services'

const FILTERS: { key: 'all' | SupportTicketStatus; label: string }[] = [
  { key: 'open', label: 'Waiting for reply' },
  { key: 'answered', label: 'Answered' },
  { key: 'solved', label: 'Solved' },
  { key: 'all', label: 'All' },
]

const stamp = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return `${formatDate(parsed)} ${parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export default function SuperAdminSupport() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | SupportTicketStatus>('open')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { load() }, [])

  // The inbox is left open all day, so it keeps itself current while somebody
  // is looking at it - a customer's reply should not need a button press.
  useLiveTickets(() => load(true))
  const heartbeat = useTypingHeartbeat(selectedId)

  async function load(quiet = false) {
    if (!quiet) setLoading(true)
    try {
      setTickets(await getAllSupportTickets())
    } catch (error: any) {
      if (!quiet) toast.error(error.message || 'Failed to load support tickets')
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  // Sorted so the longest unanswered wait is at the top - see lib/supportInbox
  // for why newest-first is the wrong order for a queue.
  const ordered = useMemo(() => sortInbox(tickets), [tickets])
  const shown = useMemo(
    () => (filter === 'all' ? ordered : ordered.filter(t => t.status === filter)),
    [ordered, filter],
  )
  const waiting = awaitingCount(tickets)
  const selected = shown.find(t => t.id === selectedId) || tickets.find(t => t.id === selectedId) || null

  // Opening the page on the ticket that has waited longest, rather than on an
  // empty pane the reader has to fill themselves.
  useEffect(() => {
    if (!selectedId && shown.length) setSelectedId(shown[0].id)
  }, [shown, selectedId])

  async function send() {
    if (!selected) return
    const text = reply.trim()
    if (!text) return toast.error('Write a reply before sending')
    setSending(true)
    try {
      const updated = await replyToSupportTicket(selected.id, text)
      // Keep the customer block: the reply response carries the thread but not
      // who is asking, and losing it would blank the header mid-conversation.
      setTickets(prev => prev.map(t => (t.id === updated.id ? { ...updated, owner: t.owner } : t)))
      setReply('')
      toast.success('Reply sent')
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  async function solve(ticket: SupportTicket) {
    const ok = await confirmAction({
      title: 'Mark this ticket solved?',
      message: `${askerName(ticket)} will see it as Solved on their support page. They can still write again, which reopens it.`,
      confirmText: 'Yes, mark solved',
      cancelText: 'Cancel',
    })
    if (!ok) return
    try {
      const updated = await markSupportTicketSolved(ticket.id)
      setTickets(prev => prev.map(t => (t.id === updated.id ? { ...updated, owner: t.owner } : t)))
      toast.success('Marked as solved')
    } catch (error: any) {
      toast.error(error.message || 'Failed to mark solved')
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Support"
        subtitle="Questions customers have sent from inside their workspace"
        actions={<button className="btn-secondary" onClick={() => load()}><RefreshCcw size={16} /> Refresh</button>}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Waiting for reply"
          value={String(waiting)}
          subtitle={waiting ? 'Oldest is at the top of the list' : 'Nothing is waiting on us'}
          icon={<MessageCircle size={20} />}
          color={waiting ? 'red' : 'green'}
        />
        <StatCard title="Answered" value={String(tickets.filter(t => t.status === 'answered').length)} icon={<Send size={20} />} color="blue" />
        <StatCard title="Solved" value={String(tickets.filter(t => t.status === 'solved').length)} icon={<CheckCircle2 size={20} />} color="green" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => { setFilter(item.key); setSelectedId(null) }}
            aria-pressed={item.key === filter}
            className={
              item.key === filter
                ? 'btn-primary !px-3 !py-1.5 !text-xs'
                : 'rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-neutral-100 hover:text-slate-900'
            }
          >
            {item.label}
            {item.key === 'open' && waiting > 0 && (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-[10px]">{waiting}</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* The queue */}
        <div className="card max-h-[640px] overflow-y-auto p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-400">Loading…</div>
          ) : shown.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {filter === 'open' ? 'Nothing is waiting on a reply.' : 'No tickets here yet.'}
            </div>
          ) : (
            shown.map(ticket => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setSelectedId(ticket.id)}
                className={`block w-full border-b border-slate-100 p-4 text-left transition hover:bg-neutral-50 ${
                  ticket.id === selectedId ? 'bg-neutral-100' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-semibold text-slate-800">{askerName(ticket)}</span>
                  <span className={`${statusClass[ticket.status]} shrink-0`}>{statusLabel[ticket.status]}</span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-600">{ticket.subject}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {ticket.status === 'open' ? `waiting ${waitedFor(ticket.last_message_at)}` : stamp(ticket.last_message_at)}
                </p>
              </button>
            ))
          )}
        </div>

        {/* The conversation */}
        <div className="card flex min-h-[420px] flex-col p-0">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">
              Pick a ticket to read it.
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-slate-900">{selected.subject}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {askerName(selected)}
                      {selected.owner?.phone ? ` · ${selected.owner.phone}` : ''}
                      {selected.owner?.email ? ` · ${selected.owner.email}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={statusClass[selected.status]}>{statusLabel[selected.status]}</span>
                    {selected.status !== 'solved' && (
                      <button className="btn-secondary !py-1.5 !text-xs" onClick={() => solve(selected)}>
                        <CheckCircle2 size={15} /> Mark solved
                      </button>
                    )}
                  </div>
                </div>
                {selected.status === 'solved' && selected.solved_at && (
                  <p className="mt-2 text-xs text-brand-green">
                    Solved {stamp(selected.solved_at)}{selected.solved_by ? ` by ${selected.solved_by}` : ''}
                  </p>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {selected.messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-400"><NoValue /></p>
                ) : (
                  selected.messages.map(message => (
                    <div key={message.id} className={`flex ${message.from_admin ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                          message.from_admin ? 'bg-slate-900 text-white' : 'border border-surface-border bg-white text-slate-800'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p className={`mt-1 text-[11px] ${message.from_admin ? 'text-white/50' : 'text-slate-400'}`}>
                          {message.from_admin ? 'Support' : message.author_name || 'Customer'} · {stamp(message.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {selected.other_typing && <TypingBubble label="The customer is typing" />}
              </div>

              <div className="border-t border-slate-100 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    className="input min-h-[44px] flex-1 resize-y py-2"
                    rows={2}
                    placeholder="Write your reply…"
                    value={reply}
                    onChange={e => { setReply(e.target.value); heartbeat() }}
                    // Enter sends, Shift+Enter starts a line: a reply is
                    // usually one sentence, and reaching for the mouse each
                    // time is what makes an inbox slow to work through.
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                    }}
                  />
                  <button className="btn-primary shrink-0" onClick={send} disabled={sending}>
                    <Send size={16} /> {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
