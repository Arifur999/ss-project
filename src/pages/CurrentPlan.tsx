import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Crown, Sparkles, Timer } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { getPaymentInfo } from '../services/admin.services'

// Must match SubscriptionPlans / SubscriptionCheckout so the checkout page can
// read which plan the owner is paying for.
const CHECKOUT_STORAGE_KEY = 'subscription_checkout_plan'

const money = (n: number) => 'Tk ' + Number(n || 0).toLocaleString('en-US')
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

type PlanKind = 'free_trial' | 'monthly' | 'yearly'

export default function CurrentPlan() {
  const { subscription, subscriptionStatus } = useAuth()
  const { lang } = useLang()
  const navigate = useNavigate()
  const [prices, setPrices] = useState<{ monthly: number; yearly: number; yearlyOriginal: number } | null>(null)

  const bn = lang === 'bn'

  useEffect(() => {
    getPaymentInfo()
      .then(info => setPrices({ monthly: Number(info.monthly_price), yearly: Number(info.yearly_price), yearlyOriginal: Number(info.yearly_original_price) }))
      .catch(() => setPrices({ monthly: 599, yearly: 5750, yearlyOriginal: 7188 }))
  }, [])

  const planType = (subscription?.plan_type || 'free_trial') as PlanKind
  const isActive = subscriptionStatus === 'active'
  const expiry = subscription?.expiry_date || null
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null

  const planLabel = (kind: PlanKind) =>
    kind === 'yearly' ? (bn ? 'বার্ষিক' : 'Yearly')
      : kind === 'monthly' ? (bn ? 'মাসিক' : 'Monthly')
        : (bn ? 'ফ্রি ট্রায়াল' : 'Free Trial')

  // Buying / renewing any paid plan goes straight to the manual bKash checkout.
  // We do NOT call choosePlan here, so an already-active owner keeps their
  // access; the approved payment stacks onto their current expiry (e.g. a live
  // 1-year plan + a monthly top-up => 365 + 30 days).
  function goToCheckout(plan: 'monthly' | 'yearly') {
    localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({ planId: plan, selectedAt: new Date().toISOString() }))
    navigate('/subscription-checkout', { state: { planId: plan } })
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <PageHeader title={bn ? 'বর্তমান প্ল্যান' : 'Current Plan'} subtitle={bn ? 'আপনার সাবস্ক্রিপশন ও প্ল্যান' : 'Your subscription & plan'} />

      {/* Current status */}
      <div className="card mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isActive && planType !== 'free_trial' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {planType === 'yearly' ? <Crown size={22} /> : planType === 'monthly' ? <Timer size={22} /> : <Sparkles size={22} />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{bn ? 'বর্তমান প্ল্যান' : 'Current plan'}</p>
              <p className="text-xl font-bold text-slate-900">{planLabel(planType)}</p>
              <span className={subscriptionStatus === 'active' ? 'badge-green' : subscriptionStatus === 'pending' ? 'badge-orange' : 'badge-red'}>{subscriptionStatus}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:text-right">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{bn ? 'মেয়াদ শেষ' : 'Expires'}</p>
              <p className="mt-1 font-bold text-slate-800">{formatDate(expiry)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{bn ? 'বাকি দিন' : 'Days left'}</p>
              <p className={`mt-1 font-bold ${daysLeft !== null && daysLeft <= 3 ? 'text-brand-red' : 'text-slate-800'}`}>
                {daysLeft === null ? '-' : daysLeft < 0 ? (bn ? 'শেষ' : 'Expired') : `${daysLeft} ${bn ? 'দিন' : daysLeft === 1 ? 'day' : 'days'}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Three plan cards, always shown */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PlanCard
          icon={<Sparkles size={20} />}
          title={bn ? 'ফ্রি ট্রায়াল' : 'Free Trial'}
          price={bn ? '৳০ / ৭ দিন' : 'Tk 0 / 7 days'}
          note={bn ? 'একবারই ব্যবহারযোগ্য' : 'One-time only'}
          features={[
            bn ? 'সম্পূর্ণ সফটওয়্যার অ্যাক্সেস' : 'Full software access',
            bn ? '৭ দিনের জন্য' : 'Valid for 7 days',
          ]}
          isCurrent={planType === 'free_trial' && isActive}
          // Free trial is NEVER purchasable from here - always disabled.
          disabled
          onSelect={() => undefined}
          bn={bn}
        />
        <PlanCard
          icon={<Timer size={20} />}
          title={bn ? 'মাসিক' : 'Monthly'}
          price={prices ? `${money(prices.monthly)} / ${bn ? 'মাস' : 'month'}` : '...'}
          note={bn ? 'কোনো ডিসকাউন্ট নেই' : 'No discount'}
          features={[
            bn ? 'সম্পূর্ণ সফটওয়্যার অ্যাক্সেস' : 'Full software access',
            bn ? 'প্রতি মাসে বিল' : 'Billed monthly',
            bn ? 'মেয়াদের সাথে যোগ হয়' : 'Adds to your current expiry',
          ]}
          isCurrent={planType === 'monthly' && isActive}
          onSelect={() => goToCheckout('monthly')}
          bn={bn}
        />
        <PlanCard
          icon={<Crown size={20} />}
          title={bn ? 'বার্ষিক' : 'Yearly'}
          price={prices ? `${money(prices.yearly)} / ${bn ? 'বছর' : 'year'}` : '...'}
          originalPrice={prices && prices.yearlyOriginal > prices.yearly ? money(prices.yearlyOriginal) : undefined}
          note={bn ? 'সবচেয়ে সাশ্রয়ী' : 'Best value'}
          features={[
            bn ? 'সম্পূর্ণ আনলিমিটেড ফিচার' : 'All features unlocked',
            bn ? 'প্রায়োরিটি সাপোর্ট' : 'Priority support',
            bn ? 'মেয়াদের সাথে যোগ হয়' : 'Adds to your current expiry',
          ]}
          isCurrent={planType === 'yearly' && isActive}
          onSelect={() => goToCheckout('yearly')}
          highlighted
          popular
          bn={bn}
        />
      </div>
    </div>
  )
}

function PlanCard({
  icon, title, price, originalPrice, note, features, isCurrent, disabled, onSelect, highlighted, popular, bn,
}: {
  icon: React.ReactNode
  title: string
  price: string
  originalPrice?: string
  note: string
  features: string[]
  isCurrent: boolean
  disabled?: boolean
  onSelect: () => void
  highlighted?: boolean
  popular?: boolean
  bn: boolean
}) {
  const buttonDisabled = disabled || isCurrent
  const buttonLabel = isCurrent
    ? (bn ? 'অ্যাক্টিভ' : 'Active')
    : disabled
      ? (bn ? 'উপলব্ধ নয়' : 'Not available')
      : (bn ? 'কিনুন / রিনিউ' : 'Choose / Renew')

  const buttonClass = isCurrent
    ? 'bg-green-50 text-brand-green border border-green-200 cursor-default'
    : disabled
      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
      : highlighted
        ? 'bg-slate-900 text-white hover:bg-black'
        : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'

  return (
    <section className={`relative flex flex-col rounded-2xl border bg-white px-[30px] py-[60px] shadow-sm ${isCurrent ? 'border-brand-green ring-2 ring-green-100' : highlighted ? 'border-slate-900 ring-2 ring-slate-200' : 'border-slate-200'}`}>
      {isCurrent ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-green px-3 py-0.5 text-[11px] font-black text-white shadow-sm">
          {bn ? 'অ্যাক্টিভ' : 'ACTIVE'}
        </span>
      ) : popular ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-0.5 text-[11px] font-black text-white shadow-sm">
          {bn ? 'জনপ্রিয়' : 'POPULAR'}
        </span>
      ) : null}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">{title}</span>
        <span className={`rounded-xl p-2 ${highlighted ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-2">
        {originalPrice && <span className="text-base font-bold text-slate-400 line-through">{originalPrice}</span>}
        <span className="text-2xl font-black text-slate-950">{price}</span>
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-400">{note}</p>
      <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-600">
        {features.map(feature => (
          <li key={feature} className="flex gap-2">
            <CheckCircle2 size={17} className="mt-0.5 flex-shrink-0 text-brand-green" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={buttonDisabled ? undefined : onSelect}
        disabled={buttonDisabled}
        className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-colors ${buttonClass}`}
      >
        {isCurrent && <CheckCircle2 size={16} />} {buttonLabel}
      </button>
    </section>
  )
}
