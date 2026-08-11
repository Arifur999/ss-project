import React, { useEffect, useState } from 'react'
import { Phone, ShieldCheck, Timer } from 'lucide-react'
import type { Lang } from '../context/LanguageContext'
import { supportNumberOrFallback, whatsAppLink } from '../lib/support'

// Approval window shown after a manual payment is submitted. The countdown is
// anchored to the server's `submittedAt`, so reloading the page keeps the real
// remaining time instead of restarting (or losing) the wait screen.
const APPROVAL_WINDOW_MS = 30 * 60 * 1000

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function PendingApproval({
  lang,
  planType,
  submittedAt,
  supportNumber,
  onGoDashboard,
  goDashboardLabel,
}: {
  lang: Lang
  planType?: string | null
  submittedAt?: string | null
  supportNumber?: string | null
  onGoDashboard?: () => void
  goDashboardLabel?: string
}) {
  const bn = lang === 'bn'
  const deadline = submittedAt ? new Date(submittedAt).getTime() + APPROVAL_WINDOW_MS : null
  const [remainingMs, setRemainingMs] = useState(() => (deadline ? Math.max(0, deadline - Date.now()) : 0))

  useEffect(() => {
    if (deadline === null) return
    const tick = () => setRemainingMs(Math.max(0, deadline - Date.now()))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [deadline])

  const planLabel = planType === 'monthly'
    ? (bn ? 'মাসিক' : 'Monthly')
    : planType === 'yearly'
      ? (bn ? 'বার্ষিক' : 'Yearly')
      : (bn ? 'নির্বাচিত' : 'selected')

  const waiting = remainingMs > 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-brand-green">
          <ShieldCheck size={28} />
        </div>

        <h1 className="text-2xl font-black text-slate-950">
          {bn ? 'পেমেন্ট জমা হয়েছে' : 'Payment submitted'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {bn
            ? `আপনি ${planLabel} প্ল্যানের জন্য পেমেন্ট জমা দিয়েছেন। অনুমোদনের জন্য অপেক্ষা করুন।`
            : `You have submitted payment for the ${planLabel} plan. Please wait for approval.`}
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Timer size={14} /> {bn ? 'অনুমোদন হচ্ছে' : 'Approval in progress'}
          </div>
          {waiting ? (
            <>
              <p className={`mt-2 text-4xl font-black tabular-nums ${remainingMs < 5 * 60 * 1000 ? 'text-brand-red' : 'text-slate-900'}`}>
                {formatCountdown(remainingMs)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {bn
                  ? 'সাধারণত ৩০ মিনিটের মধ্যে আপনার অ্যাকাউন্ট চালু হয়ে যাবে।'
                  : 'Your account is usually activated within 30 minutes.'}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">
              {bn
                ? `আপনি ${planLabel} প্ল্যানের জন্য পেমেন্ট সাবমিট করেছেন। অনুগ্রহ করে অপেক্ষা করুন — শীঘ্রই আপনার প্ল্যান আপডেট করা হবে।`
                : `You have submitted payment for the ${planLabel} plan. Please wait - your plan will be updated shortly.`}
            </p>
          )}
        </div>

        {/* Falls back to the support line in lib/support.ts, so this block is
            shown even before platform settings have loaded. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-600">
          <Phone size={15} className="text-slate-400" />
          <span>{bn ? 'সাহায্য দরকার?' : 'Need help?'}</span>
          <a href={`tel:${supportNumberOrFallback(supportNumber).replace(/\s+/g, '')}`} className="font-bold text-slate-900 hover:underline">
            {supportNumberOrFallback(supportNumber)}
          </a>
          <a
            href={whatsAppLink(supportNumberOrFallback(supportNumber))}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-[#25D366] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#20bd5a]"
          >
            WhatsApp
          </a>
        </div>

        {onGoDashboard && (
          <button onClick={onGoDashboard} className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-black">
            {goDashboardLabel || (bn ? 'ড্যাশবোর্ডে যান' : 'Go to dashboard')}
          </button>
        )}
      </div>
    </div>
  )
}
