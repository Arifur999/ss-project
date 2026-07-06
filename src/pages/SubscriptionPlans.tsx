import React, { useMemo, useState } from 'react'
import { CheckCircle2, Crown, Globe, Send, ShieldCheck, Sparkles, Star, Users } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { Lang, useLang } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'

type PlanId = 'free_trial' | 'monthly' | 'yearly'

const planCopy = {
  en: {
    title: 'Choose Your Workspace Plan',
    subtitle: 'Get started with a 7-day risk-free trial. Upgrade or cancel anytime.',
    freeTitle: '7-Day Free Trial',
    freeButton: 'Start Free Trial',
    monthlyTitle: 'Monthly Subscription',
    monthlyPrice: '৳599 / month',
    monthlyButton: 'Choose Monthly Plan',
    yearlyTitle: 'Yearly Subscription',
    yearlyBadge: 'BEST VALUE - 20% OFF',
    yearlyOriginal: '৳7,188',
    yearlyPrice: '৳5,750 / year',
    yearlyButton: 'Get Yearly Access',
    saving: 'Recommended',
    processing: 'Processing...',
    checkoutTitle: 'Subscription Checkout',
    checkoutSubtitle: 'Your selected plan is ready for invoice payment processing.',
    backToPlans: 'Back to plans',
    goDashboard: 'Go to workspace',
    pendingPayment: 'Payment checkout portal is ready for the selected plan.',
  },
  bn: {
    title: 'আপনার ওয়ার্কস্পেস প্ল্যান নির্বাচন করুন',
    subtitle: '৭ দিনের ঝুঁকিমুক্ত ট্রায়াল দিয়ে শুরু করুন। যেকোনো সময় আপগ্রেড বা বাতিল করুন।',
    freeTitle: '৭ দিনের ফ্রি ট্রায়াল',
    freeButton: 'ফ্রি ট্রায়াল শুরু করুন',
    monthlyTitle: 'মাসিক সাবস্ক্রিপশন',
    monthlyPrice: '৳৫৯৯ / মাস',
    monthlyButton: 'মাসিক প্ল্যান নির্বাচন করুন',
    yearlyTitle: 'বার্ষিক সাবস্ক্রিপশন',
    yearlyBadge: 'সেরা অফার - ২০% ছাড়',
    yearlyOriginal: '৳৭,১৮৮',
    yearlyPrice: '৳৫,৭৫০ / বছর',
    yearlyButton: 'বার্ষিক অ্যাক্সেস নিন',
    saving: 'প্রস্তাবিত',
    processing: 'প্রসেস হচ্ছে...',
    checkoutTitle: 'সাবস্ক্রিপশন চেকআউট',
    checkoutSubtitle: 'আপনার নির্বাচিত প্ল্যান ইনভয়েস পেমেন্ট প্রসেসিংয়ের জন্য প্রস্তুত।',
    backToPlans: 'প্ল্যানে ফিরে যান',
    goDashboard: 'ওয়ার্কস্পেসে যান',
    pendingPayment: 'নির্বাচিত প্ল্যানের জন্য পেমেন্ট চেকআউট পোর্টাল প্রস্তুত।',
  },
} satisfies Record<Lang, Record<string, string>>

const featureCopy = {
  en: {
    free: ['Full software access', '1 dynamic user workspace', 'Standard reports', 'Basic backup layers'],
    monthly: ['All core software tools', 'Multi-user access role mapping', 'Full sales and inventory analytics tracking'],
    yearly: ['Absolute unlimited workspace features', 'Priority VIP tech support hotline', 'Isolated automated database schema backup engine'],
  },
  bn: {
    free: ['সম্পূর্ণ সফটওয়্যার অ্যাক্সেস', '১টি ডাইনামিক ইউজার ওয়ার্কস্পেস', 'স্ট্যান্ডার্ড রিপোর্ট', 'বেসিক ব্যাকআপ লেয়ার'],
    monthly: ['সব কোর সফটওয়্যার টুল', 'মাল্টি-ইউজার অ্যাক্সেস রোল ম্যাপিং', 'সম্পূর্ণ সেলস ও ইনভেন্টরি অ্যানালিটিক্স ট্র্যাকিং'],
    yearly: ['সম্পূর্ণ আনলিমিটেড ওয়ার্কস্পেস ফিচার', 'প্রায়োরিটি VIP টেক সাপোর্ট হটলাইন', 'আইসোলেটেড অটোমেটেড ডাটাবেস স্কিমা ব্যাকআপ ইঞ্জিন'],
  },
} satisfies Record<Lang, Record<'free' | 'monthly' | 'yearly', string[]>>

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isMissingExpiryDateColumn(error: any) {
  const message = String(error?.message || '')
  return message.includes('expiry_date') && message.includes('owner_subscriptions') && message.includes('schema cache')
}

function withoutExpiryDate(payload: Record<string, any>) {
  const next = { ...payload }
  delete next.expiry_date
  return next
}

export default function SubscriptionPlans() {
  const { user, profile, subscription, refreshAccount } = useAuth()
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null)
  const copy = (key: keyof typeof planCopy.en) => t(`plans_${key}`, planCopy[lang][key])

  const plans = useMemo(() => [
    {
      id: 'free_trial' as const,
      eyebrow: 'FREE TRIAL',
      title: copy('freeTitle'),
      price: '৳0',
      features: featureCopy[lang].free,
      button: copy('freeButton'),
      icon: <Sparkles size={22} />,
      cardClass: 'border-slate-200',
      buttonClass: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    },
    {
      id: 'monthly' as const,
      eyebrow: 'MONTHLY PLAN',
      title: copy('monthlyTitle'),
      price: copy('monthlyPrice'),
      features: featureCopy[lang].monthly,
      button: copy('monthlyButton'),
      icon: <Users size={22} />,
      cardClass: 'border-blue-200',
      buttonClass: 'bg-blue-700 text-white hover:bg-blue-800',
    },
    {
      id: 'yearly' as const,
      eyebrow: 'YEARLY PLAN',
      title: copy('yearlyTitle'),
      price: copy('yearlyPrice'),
      originalPrice: copy('yearlyOriginal'),
      badge: copy('yearlyBadge'),
      features: featureCopy[lang].yearly,
      button: copy('yearlyButton'),
      icon: <Crown size={22} />,
      cardClass: 'border-emerald-400 ring-2 ring-emerald-100',
      buttonClass: 'bg-emerald-600 text-white hover:bg-emerald-700',
      highlighted: true,
    },
  ], [lang, t])

  if (!user) return <Navigate to="/register" replace />

  async function choosePlan(planId: PlanId) {
    if (!user) return
    setLoadingPlan(planId)
    const now = new Date()
    const expiry = planId === 'free_trial'
      ? addDays(now, 7)
      : planId === 'monthly'
        ? addMonths(now, 1)
        : addMonths(now, 12)
    const isTrial = planId === 'free_trial'
    const payload = {
      owner_id: user.id,
      business_name: subscription?.business_name || user.user_metadata?.business_name || profile?.full_name || 'My Business',
      owner_email: user.email || '',
      status: isTrial ? 'active' : 'pending',
      plan: isTrial ? 'Trial' : planId === 'monthly' ? 'Starter' : 'Enterprise',
      trial_start: now.toISOString(),
      trial_end: addDays(now, 7).toISOString(),
      active_until: isTrial ? expiry.toISOString() : null,
      plan_type: planId,
      plan_status: isTrial ? 'active' : 'expired',
      start_date: now.toISOString(),
      expiry_date: expiry.toISOString(),
      blocked_reason: '',
      updated_at: now.toISOString(),
    }

    let result = await supabase
      .from('owner_subscriptions')
      .upsert(payload, { onConflict: 'owner_id' })
      .select()
      .maybeSingle()

    if (result.error && isMissingExpiryDateColumn(result.error)) {
      result = await supabase
        .from('owner_subscriptions')
        .upsert(withoutExpiryDate(payload), { onConflict: 'owner_id' })
        .select()
        .maybeSingle()
    }

    if (result.error) {
      toast.error(result.error.message)
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

    localStorage.setItem('subscription_checkout_plan', JSON.stringify({ planId, expiry: expiry.toISOString(), selectedAt: now.toISOString() }))
    toast.success(copy('pendingPayment'))
    navigate('/subscription-checkout', { replace: true, state: { planId } })
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="fixed right-4 top-4 z-20 flex items-center gap-1 rounded-lg bg-white p-0.5 shadow-sm">
        <Globe size={13} className="ml-1.5 text-slate-400" />
        <button onClick={() => setLang('en')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>EN</button>
        <button onClick={() => setLang('bn')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${lang === 'bn' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>বাংলা</button>
      </div>

      <div className="mx-auto max-w-6xl">
        <header className="mx-auto mb-8 max-w-2xl text-center">
          <h1 className="text-3xl font-black text-slate-950 sm:text-4xl">{copy('title')}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 sm:text-base">{copy('subtitle')}</p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                {plan.originalPrice && <span className="mr-2 text-sm font-bold text-slate-400 line-through">{plan.originalPrice}</span>}
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
                disabled={loadingPlan !== null}
                className={`mt-auto flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-colors disabled:opacity-60 ${plan.buttonClass}`}
              >
                {loadingPlan === plan.id ? copy('processing') : plan.button}
                {loadingPlan !== plan.id && <Send size={16} />}
              </button>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SubscriptionCheckout() {
  const { user } = useAuth()
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const copy = (key: keyof typeof planCopy.en) => t(`plans_${key}`, planCopy[lang][key])

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="fixed right-4 top-4 z-20 flex items-center gap-1 rounded-lg bg-white p-0.5 shadow-sm">
        <Globe size={13} className="ml-1.5 text-slate-400" />
        <button onClick={() => setLang('en')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>EN</button>
        <button onClick={() => setLang('bn')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${lang === 'bn' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>বাংলা</button>
      </div>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <ShieldCheck size={28} />
        </div>
        <h1 className="text-2xl font-black text-slate-950">{copy('checkoutTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{copy('checkoutSubtitle')}</p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={() => navigate('/choose-plan')} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">{copy('backToPlans')}</button>
          <button onClick={() => navigate('/')} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">{copy('goDashboard')}</button>
        </div>
      </div>
    </div>
  )
}
