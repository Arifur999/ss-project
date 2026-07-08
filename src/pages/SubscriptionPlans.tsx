import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Copy, Crown, Globe, Send, ShieldCheck, Smartphone, Sparkles, Timer, Users } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { choosePlan as choosePlanRequest, getPaymentInfo, submitManualPayment } from '../services/admin.services'
import { Lang, useLang } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'

type PlanId = 'free_trial' | 'yearly'

// Formats a plain number the same way the rest of the app shows currency.
function formatBDT(value: number) {
  return `৳${Number(value || 0).toLocaleString('en-BD')}`
}

const planCopy = {
  en: {
    title: 'Choose Your Workspace Plan',
    subtitle: 'Get started with a 7-day risk-free trial. Upgrade or cancel anytime.',
    freeTitle: '7-Day Free Trial',
    freeButton: 'Start Free Trial',
    yearlyTitle: 'Yearly Subscription',
    yearlyBadge: 'BEST VALUE',
    yearlyButton: 'Get Yearly Access',
    processing: 'Processing...',
    // --- Checkout: step 1 (send money) ---
    checkoutTitle: 'Pay via bKash',
    checkoutSubtitle: 'Send the amount below using bKash, then submit your transaction details.',
    amountLabel: 'Amount to pay',
    bkashNumberLabel: 'Send Money to this bKash number',
    copy: 'Copy',
    copied: 'Copied!',
    scanQr: 'Or scan this QR code in your bKash app',
    timeLeft: 'Complete payment within',
    sessionExpired: 'This checkout session expired. Please choose your plan again.',
    nextStep: 'I have paid - Next',
    backToPlans: 'Back to plans',
    // --- Checkout: step 2 (submit trx) ---
    submitTitle: 'Submit Payment Details',
    submitSubtitle: 'Enter the bKash number you paid FROM and the Transaction ID (TrxID) from your bKash confirmation SMS.',
    senderNumberLabel: 'Your bKash number',
    senderNumberPlaceholder: '01XXXXXXXXX',
    trxIdLabel: 'Transaction ID (TrxID)',
    trxIdPlaceholder: 'e.g. 9J7K2L1M0N',
    back: 'Back',
    submit: 'Submit for Approval',
    submitting: 'Submitting...',
    // --- Checkout: done ---
    doneTitle: 'Payment Submitted!',
    doneSubtitle: 'Your payment is now waiting for super admin approval. You will get full access as soon as it is approved.',
    goDashboard: 'Go to workspace',
    freeUsedButton: 'Trial Already Used',
    freeUsedNote: "You've already used your free trial. Please ask your super admin to grant a trial extension.",
  },
  bn: {
    title: 'আপনার ওয়ার্কস্পেস প্ল্যান নির্বাচন করুন',
    subtitle: '৭ দিনের ঝুঁকিমুক্ত ট্রায়াল দিয়ে শুরু করুন। যেকোনো সময় আপগ্রেড বা বাতিল করুন।',
    freeTitle: '৭ দিনের ফ্রি ট্রায়াল',
    freeButton: 'ফ্রি ট্রায়াল শুরু করুন',
    yearlyTitle: 'বার্ষিক সাবস্ক্রিপশন',
    yearlyBadge: 'সেরা অফার',
    yearlyButton: 'বার্ষিক অ্যাক্সেস নিন',
    processing: 'প্রসেস হচ্ছে...',
    checkoutTitle: 'বিকাশে পেমেন্ট করুন',
    checkoutSubtitle: 'নিচের নম্বরে বিকাশ দিয়ে টাকা পাঠান, তারপর ট্রানজেকশনের তথ্য জমা দিন।',
    amountLabel: 'পরিশোধের পরিমাণ',
    bkashNumberLabel: 'এই বিকাশ নম্বরে Send Money করুন',
    copy: 'কপি করুন',
    copied: 'কপি হয়েছে!',
    scanQr: 'অথবা বিকাশ অ্যাপে এই QR কোড স্ক্যান করুন',
    timeLeft: 'এর মধ্যে পেমেন্ট সম্পন্ন করুন',
    sessionExpired: 'চেকআউট সেশনের মেয়াদ শেষ হয়ে গেছে। আবার প্ল্যান নির্বাচন করুন।',
    nextStep: 'পেমেন্ট করেছি - পরবর্তী',
    backToPlans: 'প্ল্যানে ফিরে যান',
    submitTitle: 'পেমেন্টের তথ্য জমা দিন',
    submitSubtitle: 'যে বিকাশ নম্বর থেকে টাকা পাঠিয়েছেন এবং বিকাশের কনফার্মেশন এসএমএসের ট্রানজেকশন আইডি (TrxID) লিখুন।',
    senderNumberLabel: 'আপনার বিকাশ নম্বর',
    senderNumberPlaceholder: '০১XXXXXXXXX',
    trxIdLabel: 'ট্রানজেকশন আইডি (TrxID)',
    trxIdPlaceholder: 'যেমন: 9J7K2L1M0N',
    back: 'পেছনে',
    submit: 'অনুমোদনের জন্য জমা দিন',
    submitting: 'জমা হচ্ছে...',
    doneTitle: 'পেমেন্ট জমা হয়েছে!',
    doneSubtitle: 'আপনার পেমেন্ট এখন সুপার অ্যাডমিনের অনুমোদনের অপেক্ষায় আছে। অনুমোদন হলেই সম্পূর্ণ অ্যাক্সেস পাবেন।',
    goDashboard: 'ওয়ার্কস্পেসে যান',
    freeUsedButton: 'ট্রায়াল ব্যবহৃত হয়ে গেছে',
    freeUsedNote: 'আপনি ইতিমধ্যে আপনার ফ্রি ট্রায়াল ব্যবহার করে ফেলেছেন। ট্রায়াল বাড়ানোর জন্য আপনার সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।',
  },
} satisfies Record<Lang, Record<string, string>>

const featureCopy = {
  en: {
    free: ['Full software access', '1 dynamic user workspace', 'Standard reports', 'Basic backup layers'],
    yearly: ['Absolute unlimited workspace features', 'Priority VIP tech support hotline', 'Isolated automated database schema backup engine'],
  },
  bn: {
    free: ['সম্পূর্ণ সফটওয়্যার অ্যাক্সেস', '১টি ডাইনামিক ইউজার ওয়ার্কস্পেস', 'স্ট্যান্ডার্ড রিপোর্ট', 'বেসিক ব্যাকআপ লেয়ার'],
    yearly: ['সম্পূর্ণ আনলিমিটেড ওয়ার্কস্পেস ফিচার', 'প্রায়োরিটি VIP টেক সাপোর্ট হটলাইন', 'আইসোলেটেড অটোমেটেড ডাটাবেস স্কিমা ব্যাকআপ ইঞ্জিন'],
  },
} satisfies Record<Lang, Record<'free' | 'yearly', string[]>>

// localStorage key that carries the selected plan + the moment it was chosen
// across the /choose-plan -> /subscription-checkout navigation. The
// checkout page uses `selectedAt` to run its 30-minute payment countdown.
const CHECKOUT_STORAGE_KEY = 'subscription_checkout_plan'

export default function SubscriptionPlans() {
  const { user, subscription, refreshAccount } = useAuth()
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null)
  // The yearly price is set by the super admin (Settings -> Payment info)
  // and fetched here so the card never shows a stale hard-coded number.
  const [yearlyPrice, setYearlyPrice] = useState<number | null>(null)
  const copy = (key: keyof typeof planCopy.en) => t(`plans_${key}`, planCopy[lang][key])
  // Every owner's free trial is spent automatically at registration, so this
  // is true for essentially everyone who lands here - it only ever turns
  // false again if a super admin grants a fresh trial extension.
  const trialUsed = Boolean(subscription?.trial_used)

  useEffect(() => {
    getPaymentInfo()
      .then(info => setYearlyPrice(Number(info.yearly_price)))
      .catch(() => setYearlyPrice(5750)) // sane fallback if settings can't load
  }, [])

  const plans = useMemo(() => [
    {
      id: 'free_trial' as const,
      eyebrow: 'FREE TRIAL',
      title: copy('freeTitle'),
      price: '৳0',
      features: featureCopy[lang].free,
      button: trialUsed ? copy('freeUsedButton') : copy('freeButton'),
      note: trialUsed ? copy('freeUsedNote') : null,
      disabled: trialUsed,
      icon: <Sparkles size={22} />,
      cardClass: 'border-slate-200',
      buttonClass: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    },
    {
      id: 'yearly' as const,
      eyebrow: 'YEARLY PLAN',
      title: copy('yearlyTitle'),
      price: yearlyPrice === null ? '...' : `${formatBDT(yearlyPrice)} / year`,
      badge: copy('yearlyBadge'),
      features: featureCopy[lang].yearly,
      button: copy('yearlyButton'),
      note: null as string | null,
      disabled: false,
      icon: <Crown size={22} />,
      cardClass: 'border-emerald-400 ring-2 ring-emerald-100',
      buttonClass: 'bg-emerald-600 text-white hover:bg-emerald-700',
      highlighted: true,
    },
  ], [lang, t, yearlyPrice, trialUsed])

  if (!user) return <Navigate to="/register" replace />

  async function choosePlan(planId: PlanId) {
    if (!user) return
    // Belt-and-suspenders: the button is already disabled for this case, but
    // the backend is the real gate - this just avoids a round trip.
    if (planId === 'free_trial' && trialUsed) {
      toast.error(copy('freeUsedNote'))
      return
    }
    setLoadingPlan(planId)
    const isTrial = planId === 'free_trial'

    try {
      // POST /subscriptions/choose-plan: trial activates instantly, yearly
      // flips the subscription to "pending" and sends the owner to the
      // manual bKash checkout - no payment record is created yet.
      await choosePlanRequest({ plan_type: planId })
    } catch (error: any) {
      toast.error(error.message)
      setLoadingPlan(null)
      return
    }

    await refreshAccount()
    setLoadingPlan(null)

    if (isTrial) {
      toast.success(copy('freeButton'))
      navigate('/', { replace: true })
      return
    }

    // selectedAt anchors the checkout page's 30-minute payment countdown.
    localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({ planId, selectedAt: new Date().toISOString() }))
    navigate('/subscription-checkout', { replace: true, state: { planId } })
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="fixed right-4 top-4 z-20 flex items-center gap-1 rounded-lg bg-white p-0.5 shadow-sm">
        <Globe size={13} className="ml-1.5 text-slate-400" />
        <button onClick={() => setLang('en')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>EN</button>
        <button onClick={() => setLang('bn')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${lang === 'bn' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>বাংলা</button>
      </div>

      <div className="mx-auto max-w-3xl">
        <header className="mx-auto mb-8 max-w-2xl text-center">
          <h1 className="text-3xl font-black text-slate-950 sm:text-4xl">{copy('title')}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 sm:text-base">{copy('subtitle')}</p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {plans.map(plan => (
            <section key={plan.id} className={`relative flex min-h-[460px] flex-col rounded-2xl border bg-white p-6 shadow-sm ${plan.cardClass}`}>
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-1 text-xs font-black text-white shadow-sm">
                  {plan.badge}
                </div>
              )}
              <div className="mb-5 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">{plan.eyebrow}</span>
                <span className={`rounded-xl p-2 ${plan.highlighted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{plan.icon}</span>
              </div>
              <h2 className="text-xl font-black text-slate-950">{plan.title}</h2>
              <div className="mt-4">
                <span className={`font-black ${plan.highlighted ? 'text-4xl text-emerald-700' : 'text-3xl text-slate-950'}`}>{plan.price}</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                {plan.features.map(feature => (
                  <li key={feature} className="flex gap-2">
                    <CheckCircle2 size={17} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => choosePlan(plan.id)}
                disabled={loadingPlan !== null || plan.disabled}
                className={`mt-auto flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-colors disabled:opacity-60 ${plan.buttonClass}`}
              >
                {loadingPlan === plan.id ? copy('processing') : plan.button}
                {loadingPlan !== plan.id && !plan.disabled && <Send size={16} />}
              </button>
              {plan.note && (
                <p className="mt-2 text-center text-xs text-slate-400">{plan.note}</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

// 30 minutes to complete the manual bKash payment before the checkout
// session is considered abandoned and the owner is sent back to /choose-plan.
const CHECKOUT_WINDOW_MS = 30 * 60 * 1000

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

interface PaymentInfo {
  bkash_number: string
  bkash_qr_url: string
  yearly_price: number
}

export function SubscriptionCheckout() {
  const { user, refreshAccount } = useAuth()
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const copy = (key: keyof typeof planCopy.en) => t(`plans_${key}`, planCopy[lang][key])

  // 1 = "send the money", 2 = "submit trx details", 'done' = submitted.
  const [step, setStep] = useState<1 | 2 | 'done'>(1)
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(CHECKOUT_WINDOW_MS)
  const [copied, setCopied] = useState(false)
  const [senderNumber, setSenderNumber] = useState('')
  const [trxId, setTrxId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const expiredRef = useRef(false)

  // Load the checkout session (selectedAt) written by the Plans page, and
  // fetch where the money should actually go.
  useEffect(() => {
    const raw = localStorage.getItem(CHECKOUT_STORAGE_KEY)
    if (!raw) {
      navigate('/choose-plan', { replace: true })
      return
    }

    try {
      const parsed = JSON.parse(raw) as { planId?: string; selectedAt?: string }
      const selectedAt = parsed.selectedAt ? new Date(parsed.selectedAt).getTime() : NaN
      if (parsed.planId !== 'yearly' || Number.isNaN(selectedAt)) {
        navigate('/choose-plan', { replace: true })
        return
      }
      setDeadline(selectedAt + CHECKOUT_WINDOW_MS)
    } catch {
      navigate('/choose-plan', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    getPaymentInfo()
      .then(info => setPaymentInfo({ ...info, yearly_price: Number(info.yearly_price) }))
      .catch(() => toast.error('Could not load payment info'))
  }, [])

  // Tick the countdown once a second; redirect back once time runs out.
  useEffect(() => {
    if (deadline === null || step === 'done') return

    const tick = () => {
      const remaining = deadline - Date.now()
      setRemainingMs(remaining)

      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true
        localStorage.removeItem(CHECKOUT_STORAGE_KEY)
        toast.error(copy('sessionExpired'))
        navigate('/choose-plan', { replace: true })
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, step])

  if (!user) return <Navigate to="/login" replace />

  async function copyBkashNumber() {
    if (!paymentInfo?.bkash_number) return
    try {
      await navigator.clipboard.writeText(paymentInfo.bkash_number)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy - please copy manually')
    }
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault()

    if (!/^01[0-9]{9}$/.test(senderNumber.trim())) {
      toast.error(lang === 'bn' ? 'সঠিক ১১-সংখ্যার বিকাশ নম্বর দিন' : 'Enter a valid 11-digit bKash number')
      return
    }
    if (trxId.trim().length < 6) {
      toast.error(lang === 'bn' ? 'সঠিক ট্রানজেকশন আইডি দিন' : 'Enter a valid transaction ID')
      return
    }

    setSubmitting(true)
    try {
      await submitManualPayment({ sender_number: senderNumber.trim(), trx_id: trxId.trim().toUpperCase() })
      localStorage.removeItem(CHECKOUT_STORAGE_KEY)
      // Subscription is now "pending" server-side - refresh the auth context
      // so the rest of the app (e.g. the pending lock screen) reflects it.
      await refreshAccount()
      setStep('done')
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="fixed right-4 top-4 z-20 flex items-center gap-1 rounded-lg bg-white p-0.5 shadow-sm">
        <Globe size={13} className="ml-1.5 text-slate-400" />
        <button onClick={() => setLang('en')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>EN</button>
        <button onClick={() => setLang('bn')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${lang === 'bn' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>বাংলা</button>
      </div>

      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        {step === 'done' ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <ShieldCheck size={28} />
            </div>
            <h1 className="text-2xl font-black text-slate-950">{copy('doneTitle')}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{copy('doneSubtitle')}</p>
            <button onClick={() => navigate('/', { replace: true })} className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
              {copy('goDashboard')}
            </button>
          </div>
        ) : step === 1 ? (
          <div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
                <Smartphone size={28} />
              </div>
              <h1 className="text-2xl font-black text-slate-950">{copy('checkoutTitle')}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{copy('checkoutSubtitle')}</p>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{copy('amountLabel')}</p>
              <p className="mt-1 text-3xl font-black text-slate-950">
                {paymentInfo ? formatBDT(paymentInfo.yearly_price) : '...'}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-pink-200 bg-pink-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-pink-700">{copy('bkashNumberLabel')}</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-xl font-black tracking-wider text-slate-950">
                  {paymentInfo?.bkash_number || '...'}
                </span>
                <button
                  type="button"
                  onClick={copyBkashNumber}
                  disabled={!paymentInfo?.bkash_number}
                  className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-pink-700 shadow-sm hover:bg-pink-100 disabled:opacity-50"
                >
                  <Copy size={13} />
                  {copied ? copy('copied') : copy('copy')}
                </button>
              </div>
            </div>

            {paymentInfo?.bkash_qr_url && (
              <div className="mt-4 text-center">
                <p className="mb-2 text-xs font-semibold text-slate-500">{copy('scanQr')}</p>
                <img src={paymentInfo.bkash_qr_url} alt="bKash QR code" className="mx-auto h-40 w-40 rounded-xl border border-slate-200 object-contain p-2" />
              </div>
            )}

            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">
              <Timer size={16} className={remainingMs < 5 * 60 * 1000 ? 'text-red-600' : 'text-slate-500'} />
              <span>{copy('timeLeft')}:</span>
              <span className={remainingMs < 5 * 60 * 1000 ? 'text-red-600' : 'text-slate-900'}>{formatCountdown(remainingMs)}</span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button onClick={() => navigate('/choose-plan')} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                {copy('backToPlans')}
              </button>
              <button onClick={() => setStep(2)} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
                {copy('nextStep')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitPayment}>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <ShieldCheck size={28} />
              </div>
              <h1 className="text-2xl font-black text-slate-950">{copy('submitTitle')}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{copy('submitSubtitle')}</p>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-950">{copy('senderNumberLabel')}</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  value={senderNumber}
                  onChange={e => setSenderNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder={copy('senderNumberPlaceholder')}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-950">{copy('trxIdLabel')}</label>
                <input
                  type="text"
                  value={trxId}
                  onChange={e => setTrxId(e.target.value.toUpperCase())}
                  placeholder={copy('trxIdPlaceholder')}
                  className="input uppercase"
                  required
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                {copy('back')}
              </button>
              <button type="submit" disabled={submitting} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                {submitting ? copy('submitting') : copy('submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
