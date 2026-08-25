import React from 'react'

/**
 * The three dots that say somebody is writing.
 *
 * Shaped like a message from that side rather than a line of status text, so
 * it occupies the space the message is about to occupy - the thread does not
 * jump when the real one lands.
 */
export default function TypingBubble({ mine = false, label }: { mine?: boolean; label: string }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`} aria-live="polite">
      <div
        className={`flex items-center gap-2 rounded-2xl px-4 py-3 ${
          mine ? 'bg-slate-900' : 'border border-surface-border bg-white'
        }`}
      >
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            aria-hidden="true"
            className={`h-1.5 w-1.5 animate-bounce rounded-full ${mine ? 'bg-white/70' : 'bg-slate-400'}`}
            // Staggered so it reads as a wave rather than three dots blinking
            // in unison.
            style={{ animationDelay: `${i * 140}ms`, animationDuration: '900ms' }}
          />
        ))}
      </div>
    </div>
  )
}
