import React, { useEffect, useRef } from 'react'
import { formatDate } from '../lib/utils'
import TypingBubble from './TypingBubble'

/**
 * A conversation, drawn the way people expect one to look.
 *
 * The first version stacked every message as its own boxed row with a full
 * timestamp underneath, which is why it read as flat and cramped: three lines
 * of chrome around one line of speech, repeated. The things that make a
 * messenger thread readable are all absences - no repeated name, no repeated
 * date, no gap between two lines somebody typed in the same breath - so that
 * is what this does:
 *
 *   - consecutive messages from one side group together, and only the last of
 *     a run keeps the tail and the time
 *   - the day is written once, across the thread, not on every message
 *   - the time sits inside the bubble on the last line rather than under it
 *   - bubbles size to their text and stop at 75%, so a three-word answer is a
 *     three-word bubble
 */

export type ChatMessage = {
  id: string
  body: string
  from_admin: boolean
  author_name: string
  created_at: string
}

const dayKey = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toDateString()
}

const dayLabel = (value: string, bn: boolean) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (parsed.toDateString() === today.toDateString()) return bn ? 'আজ' : 'Today'
  if (parsed.toDateString() === yesterday.toDateString()) return bn ? 'গতকাল' : 'Yesterday'
  return formatDate(parsed)
}

const clock = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatThread({
  messages,
  /** Which side of the conversation the reader is on. */
  mineIsAdmin,
  typing = false,
  typingLabel,
  bn = false,
  emptyLabel,
}: {
  messages: ChatMessage[]
  mineIsAdmin: boolean
  typing?: boolean
  typingLabel: string
  bn?: boolean
  emptyLabel?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // Follow the conversation down - but only when the reader is already at the
  // bottom. Yanking somebody back mid-scroll while they are reading something
  // further up is worse than making them scroll.
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, typing])

  if (messages.length === 0) {
    return (
      <div ref={scroller} className="flex flex-1 items-center justify-center overflow-y-auto p-6 text-sm text-slate-400">
        {emptyLabel || (bn ? 'কোনো বার্তা নেই' : 'No messages yet')}
      </div>
    )
  }

  return (
    <div ref={scroller} className="flex-1 space-y-0.5 overflow-y-auto px-4 py-4">
      {messages.map((message, index) => {
        const previous = messages[index - 1]
        const next = messages[index + 1]
        const mine = message.from_admin === mineIsAdmin
        const newDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at)
        // A run is consecutive messages from the same side on the same day.
        const startsRun = newDay || !previous || previous.from_admin !== message.from_admin
        const endsRun = !next || next.from_admin !== message.from_admin || dayKey(next.created_at) !== dayKey(message.created_at)

        return (
          <React.Fragment key={message.id}>
            {newDay && (
              <div className="flex justify-center py-3">
                <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
                  {dayLabel(message.created_at, bn)}
                </span>
              </div>
            )}
            <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${startsRun && !newDay ? 'pt-2.5' : ''}`}>
              <div
                className={[
                  'relative max-w-[75%] px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm',
                  mine ? 'bg-slate-900 text-white' : 'border border-surface-border bg-white text-slate-800',
                  // Square off the corner facing the run so grouped messages
                  // read as one block of speech rather than separate cards.
                  'rounded-2xl',
                  mine
                    ? `${startsRun ? '' : 'rounded-tr-md'} ${endsRun ? '' : 'rounded-br-md'}`
                    : `${startsRun ? '' : 'rounded-tl-md'} ${endsRun ? '' : 'rounded-bl-md'}`,
                ].join(' ')}
              >
                <p className="whitespace-pre-wrap break-words">
                  {message.body}
                  {/* Reserves room on the last line so the clock never sits on
                      top of the words - the trick every messenger uses. Only
                      where a clock is actually drawn. */}
                  {endsRun && (
                    <span className="pointer-events-none invisible select-none pl-3 text-[10px]" aria-hidden="true">
                      {clock(message.created_at)}
                    </span>
                  )}
                </p>
                {endsRun && (
                  <span
                    className={`absolute bottom-1.5 right-3 text-[10px] tabular-nums ${
                      mine ? 'text-white/45' : 'text-slate-400'
                    }`}
                  >
                    {clock(message.created_at)}
                  </span>
                )}
              </div>
            </div>
          </React.Fragment>
        )
      })}
      {typing && (
        <div className="pt-2.5">
          <TypingBubble label={typingLabel} />
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
