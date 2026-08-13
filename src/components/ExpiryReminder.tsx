import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheckIcon as CalendarClock, XIcon as X } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'

// When to warn, by plan:
//   free trial - 2 days before expiry
//   monthly    - 7, 5, 3, 2, 1 days before
//   yearly     - 15, 10, 7 days before, then every day (6,5,4,3,2,1)
// A day qualifies if daysLeft matches one of these numbers.
function shouldWarn(planType: string, daysLeft: number): boolean {
  if (daysLeft < 0) return false
  if (planType === 'yearly') return daysLeft <= 7 || daysLeft === 10 || daysLeft === 15
  if (planType === 'monthly') return [7, 5, 3, 2, 1, 0].includes(daysLeft)
  // free trial (and anything else)
  return daysLeft <= 2
}

const STORAGE_KEY = 'plan_expiry_reminder_seen_v1'

// Remember per (expiry date + daysLeft) so the modal shows once per day, and a
// renewal (new expiry date) starts a fresh series.
function alreadySeen(key: string) {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as string[]).includes(key)
  } catch {
    return false
  }
}

function markSeen(key: string) {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as string[]
    localStorage.setItem(STORAGE_KEY, JSON.stringify([key, ...list].slice(0, 40)))
  } catch {
    // storage unavailable - the modal simply shows again next time
  }
}

export default function ExpiryReminder() {
  const { subscription, profile } = useAuth()
  const { lang } = useLang()
  const navigate = useNavigate()
  const bn = lang === 'bn'
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<{ daysLeft: number; planType: string; key: string } | null>(null)

  useEffect(() => {
    if (!subscription || profile?.role === 'super_admin') return

    const expiry = subscription.expiry_date
    if (!expiry) return

    const planType = String(subscription.plan_type || 'free_trial')
    // Whole days from the start of today to the expiry moment.
    const daysLeft = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000)
    if (!shouldWarn(planType, daysLeft)) return

    const key = `${String(expiry).slice(0, 10)}|${daysLeft}`
    if (alreadySeen(key)) return

    setInfo({ daysLeft, planType, key })
    setOpen(true)
  }, [subscription, profile])

  if (!open || !info) return null

  const close = () => {
    markSeen(info.key)
    setOpen(false)
  }

  const planLabel = info.planType === 'yearly'
    ? (bn ? 'বার্ষিক প্ল্যান' : 'Yearly plan')
    : info.planType === 'monthly'
      ? (bn ? 'মাসিক প্ল্যান' : 'Monthly plan')
      : (bn ? 'ফ্রি ট্রায়াল' : 'Free Trial')

  const headline = info.daysLeft <= 0
    ? (bn ? 'আপনার প্যাকেজের মেয়াদ আজই শেষ' : 'Your package expires today')
    : bn
      ? `আপনার প্যাকেজের মেয়াদ শেষ হতে ${info.daysLeft} দিন বাকি`
      : `Your package expires in ${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'}`

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${info.daysLeft <= 2 ? 'bg-red-50 text-brand-red' : 'bg-brand-blue-soft text-brand-blue'}`}>
              <CalendarClock size={22} />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-950">{headline}</h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">{planLabel}</p>
            </div>
          </div>
          <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm leading-relaxed text-slate-600">
            {bn
              ? 'মেয়াদ শেষ হলে আপনার ওয়ার্কস্পেসে ঢোকা বন্ধ হয়ে যাবে। কাজ চালিয়ে যেতে এখনই প্ল্যান রিনিউ করে নিন।'
              : 'Once it expires you will lose access to your workspace. Renew now to keep working without interruption.'}
          </p>
        </div>

        <div className="flex gap-3 border-t border-slate-100 p-5">
          <button onClick={close} className="btn-secondary flex-1 justify-center">
            {bn ? 'পরে দেখব' : 'Later'}
          </button>
          <button
            onClick={() => { markSeen(info.key); setOpen(false); navigate('/current-plan') }}
            className="btn-primary flex-1 justify-center"
          >
            {bn ? 'এখনই রিনিউ করুন' : 'Renew now'}
          </button>
        </div>
      </div>
    </div>
  )
}
