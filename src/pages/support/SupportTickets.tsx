import React, { useEffect, useMemo, useState } from 'react'
import {
  CheckCircleIcon as CheckCircle2,
  ChatCircleTextIcon as MessageCircle,
  PlusIcon as Plus,
  ArrowsClockwiseIcon as RefreshCcw,
  PaperPlaneTiltIcon as Send,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import ChatThread from '../../components/ChatThread'
import { useTypingHeartbeat } from '../../lib/useLiveTickets'
import { TYPING_CLEAR_MS, useSupportStream } from '../../lib/useSupportStream'
import { bubbleFor, type TypingMark } from '../../lib/typingSide'
import { markSeen } from '../../lib/supportUnread'
import { announceSeen } from '../../lib/useSupportBadge'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { formatDate } from '../../lib/utils'
import {
  createSupportTicket,
  getMySupportTickets,
  replyToSupportTicket,
  type SupportTicket,
} from '../../services/support.services'

/**
 * The customer's side of support.
 *
 * It replaces a WhatsApp button, so it has to answer what WhatsApp could not:
 * has anyone read this, what did they say, and is it finished. The status line
 * on every ticket is the whole reason this page exists.
 */
export default function SupportTickets() {
  const { lang } = useLang()
  const { profile } = useAuth()
  const bn = lang === 'bn'
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [reply, setReply] = useState('')

  useEffect(() => { load() }, [])

  // Live, not polled. The stream pushes a reply the moment it is sent; a
  // four-second poll could never make a typing bubble mean anything.
  const [live, setLive] = useState(true)
  const [typingOn, setTypingOn] = useState<Record<string, TypingMark>>({})
  useSupportStream(event => {
    if (event.type === 'new') {
      // A customer already has the ticket they just opened, from the POST.
      return
    }
    if (event.type === 'typing') {
      setTypingOn(prev => ({ ...prev, [event.id]: { at: Date.now(), from: event.from } }))
      return
    }
    setTickets(prev => prev.map(t => {
      if (t.id !== event.id) return t
      const merged = {
        ...t,
        status: event.status as SupportTicket['status'],
        last_message_at: event.last_message_at,
        solved_at: event.solved_at,
        solved_by: event.solved_by,
      }
      // The sender already added their own message from the POST response, so
      // a repeat would draw it twice.
      if (event.message && !t.messages.some(m => m.id === event.message.id)) {
        merged.messages = [...t.messages, event.message]
      }
      return merged
    }))
  }, setLive)

  // The server pushes a keystroke, not a "stopped typing", so the bubble is
  // forgotten on a timer here.
  useEffect(() => {
    if (!Object.keys(typingOn).length) return
    const timer = setInterval(() => {
      const now = Date.now()
      setTypingOn(prev => {
        const next: Record<string, TypingMark> = {}
        let changed = false
        for (const [id, mark] of Object.entries(prev)) {
          if (now - mark.at < TYPING_CLEAR_MS) next[id] = mark
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [typingOn])
  // Who is typing on this ticket, or null - never yourself, and never a
  // mark that has gone stale.
  const typingOnTicket = (id: string | null) => (id ? bubbleFor(typingOn[id], false, TYPING_CLEAR_MS) : null)
  const heartbeat = useTypingHeartbeat(selectedId)

  async function load(quiet = false) {
    if (!quiet) setLoading(true)
    try {
      setTickets(await getMySupportTickets())
    } catch (error: any) {
      if (!quiet) toast.error(error.message || (bn ? 'টিকেট আনা যায়নি' : 'Failed to load your tickets'))
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  const label = {
    open: bn ? 'উত্তরের অপেক্ষায়' : 'Waiting for reply',
    answered: bn ? 'উত্তর দেওয়া হয়েছে' : 'Answered',
    solved: bn ? 'সমাধান হয়েছে' : 'Solved',
  } as const
  const badge = { open: 'badge-orange', answered: 'badge-blue', solved: 'badge-green' } as const

  const stamp = (value: string) => {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '-'
    return `${formatDate(parsed)} ${parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  }

  // Newest conversation first: unlike the platform's inbox this is not a queue
  // to work through, it is the customer's own short history.
  const ordered = useMemo(
    () => [...tickets].sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()),
    [tickets],
  )
  const selected = ordered.find(t => t.id === selectedId) || null

  useEffect(() => {
    if (!selectedId && ordered.length) setSelectedId(ordered[0].id)
  }, [ordered, selectedId])

  useEffect(() => {
    if (!selected || !profile?.id) return
    markSeen(profile.id, selected.id)
    announceSeen()
  }, [selected?.id, selected?.last_message_at, profile?.id])

  async function submit() {
    const body = message.trim()
    if (!body) return toast.error(bn ? 'আপনার সমস্যাটি লিখুন' : 'Write your question first')
    setSending(true)
    try {
      const created = await createSupportTicket({ subject: subject.trim() || undefined, message: body })
      setTickets(prev => [created, ...prev])
      setSelectedId(created.id)
      setSubject('')
      setMessage('')
      setComposing(false)
      toast.success(bn ? 'টিকেট জমা হয়েছে' : 'Ticket submitted')
    } catch (error: any) {
      toast.error(error.message || (bn ? 'জমা দেওয়া যায়নি' : 'Failed to submit'))
    } finally {
      setSending(false)
    }
  }

  async function sendReply() {
    if (!selected) return
    const text = reply.trim()
    if (!text) return toast.error(bn ? 'কিছু লিখুন' : 'Write a message first')
    try {
      const updated = await replyToSupportTicket(selected.id, text)
      setTickets(prev => prev.map(t => (t.id === updated.id ? updated : t)))
      setReply('')
    } catch (error: any) {
      toast.error(error.message || (bn ? 'পাঠানো যায়নি' : 'Failed to send'))
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title={bn ? 'সাপোর্ট টিকেট' : 'Support Ticket'}
        subtitle={bn ? 'সমস্যা জানান, উত্তর এখানেই পাবেন' : 'Ask us anything - the answer comes back here'}
        actions={
          <>
            <button className="btn-secondary" onClick={() => load()}><RefreshCcw size={16} /> {bn ? 'রিফ্রেশ' : 'Refresh'}</button>
            <button className="btn-primary" onClick={() => setComposing(true)}><Plus size={16} /> {bn ? 'নতুন টিকেট' : 'New ticket'}</button>
          </>
        }
      />

      {!loading && tickets.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-16 text-center">
          <MessageCircle size={40} className="text-slate-300" />
          <p className="text-sm text-slate-500">
            {bn
              ? 'এখনো কোনো টিকেট নেই। সমস্যা হলে এখান থেকে জানান - আমরা উত্তর দিলে এখানেই দেখতে পাবেন।'
              : 'No tickets yet. Ask here when something goes wrong - our answer comes back to this page.'}
          </p>
          <button className="btn-primary" onClick={() => setComposing(true)}><Plus size={16} /> {bn ? 'নতুন টিকেট' : 'New ticket'}</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="card max-h-[620px] overflow-y-auto p-0">
            {loading ? (
              <div className="p-6 text-center text-sm text-slate-400">{bn ? 'লোড হচ্ছে…' : 'Loading…'}</div>
            ) : (
              ordered.map(ticket => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={`block w-full border-b border-slate-100 p-4 text-left transition hover:bg-neutral-50 ${
                    ticket.id === selectedId ? 'bg-neutral-100' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate font-semibold text-slate-800">{ticket.subject}</span>
                    <span className={`${badge[ticket.status]} shrink-0`}>{label[ticket.status]}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{stamp(ticket.last_message_at)}</p>
                </button>
              ))
            )}
          </div>

          <div className="card flex min-h-[420px] flex-col p-0">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">
                {bn ? 'একটি টিকেট বেছে নিন।' : 'Pick a ticket to read it.'}
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="min-w-0 truncate text-base font-bold text-slate-900">{selected.subject}</h2>
                    <span className={badge[selected.status]}>{label[selected.status]}</span>
                  </div>
                  {selected.status === 'solved' && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-brand-green">
                      <CheckCircle2 size={14} />
                      {bn
                        ? `সমাধান হয়েছে${selected.solved_at ? ' · ' + stamp(selected.solved_at) : ''} · সমস্যা ফিরে এলে আবার লিখুন`
                        : `Solved${selected.solved_at ? ' · ' + stamp(selected.solved_at) : ''} · write again if it comes back`}
                    </p>
                  )}
                </div>

                {/* The stream retries on its own; this only says why the page has
                    gone quiet, so silence is not read as nothing happening. */}
                {!live && (
                  <p className="border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-center text-[11px] font-semibold text-amber-700">
                    {bn ? 'সংযোগ ফিরে পাওয়ার চেষ্টা চলছে…' : 'Reconnecting…'}
                  </p>
                )}
                <ChatThread
                  messages={selected.messages}
                  mineIsAdmin={false}
                  typingFrom={typingOnTicket(selected.id)}
                  typingLabel={bn ? 'সাপোর্ট লিখছে' : 'Support is typing'}
                  bn={bn}
                />

                <div className="border-t border-slate-100 p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      className="input min-h-[44px] flex-1 resize-y py-2"
                      rows={2}
                      placeholder={bn ? 'উত্তর লিখুন…' : 'Write a message…'}
                      value={reply}
                      onChange={e => { setReply(e.target.value); heartbeat() }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                    />
                    <button className="btn-primary shrink-0" onClick={sendReply}>
                      <Send size={16} /> {bn ? 'পাঠান' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={composing} onClose={() => setComposing(false)} title={bn ? 'নতুন সাপোর্ট টিকেট' : 'New support ticket'}>
        <div className="space-y-3">
          <label className="block">
            <span className="label">{bn ? 'বিষয় (ঐচ্ছিক)' : 'Subject (optional)'}</span>
            <input
              className="input"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={bn ? 'যেমন: ইনভয়েস প্রিন্ট হচ্ছে না' : 'e.g. Invoice will not print'}
            />
          </label>
          <label className="block">
            <span className="label">{bn ? 'কী সমস্যা হচ্ছে?' : 'What is going wrong?'}</span>
            <textarea
              className="input min-h-[140px] resize-y"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={
                bn
                  ? 'কোন পেজে, কী করলে সমস্যাটা হয় - যত পরিষ্কার লিখবেন তত দ্রুত সমাধান হবে।'
                  : 'Which page, and what you did when it happened - the clearer this is, the faster we can fix it.'
              }
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-secondary" onClick={() => setComposing(false)}>{bn ? 'বাতিল' : 'Cancel'}</button>
            <button className="btn-primary" onClick={submit} disabled={sending}>
              <Send size={16} /> {sending ? (bn ? 'পাঠানো হচ্ছে…' : 'Sending…') : (bn ? 'জমা দিন' : 'Submit')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
