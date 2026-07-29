import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CheckCircle2, Crown, RefreshCw, ShieldCheck, Sparkles, Timer } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { choosePlan as choosePlanRequest, getPaymentInfo } from '../services/admin.services'

// Must match SubscriptionPlans / SubscriptionCheckout so the checkout page can
// read which plan the owner is paying for.
const CHECKOUT_STORAGE_KEY = 'subscription_checkout_plan'

const money = (n: number) => 'Tk ' + Number(n || 0).toLocaleString('en-US')
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

export default function CurrentPlan() {
  const { subscription, subscriptionStatus, refreshAccount } = useAuth()
  const { lang } = useLang()
  const navigate = useNavigate()
  const [prices, setPrices] = useState<{ monthly: number; yearly: number } | null>(null)
  const [busy, setBusy] = useState<'monthly' | 'yearly' | null>(null)

  const bn = lang === 'bn'

  useEffect(() => {
    getPaymentInfo()
      .then(info => setPrices({ monthly: Number(info.monthly_price), yearly: Number(info.yearly_price) }))
      .catch(() => setPrices({ monthly: 600, yearly: 5780 }))
  }, [])

  const planType = subscription?.plan_type || 'free_trial'
  const isPaidActive = (planType === 'monthly' || planType === 'yearly') && subscriptionStatus === 'active'
  const expiry = subscription?.expiry_date || null
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null

  const planLabel = planType === 'yearly'
    ? (bn ? 'বার্ষিক' : 'Yearly')
    : planType === 'monthly'
      ? (bn ? 'মাসিক' : 'Monthly')
      : (bn ? 'ফ্রি ট্রায়াল' : 'Free Trial')

  // New selection (trial/expired owner): choosePlan flips the subscription to
  // "pending" then we hand off to the manual bKash checkout.
  async function selectPlan(plan: 'monthly' | 'yearly') {
    setBusy(plan)
    try {
      await choosePlanRequest({ plan_type: plan })
      await refreshAccount()
      localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({ planId: plan, selectedAt: new Date().toISOString() }))
      navigate('/subscription-checkout', { state: { planId: plan } })
    } catch (err: any) {
      toast.error(err.message || 'Failed to select plan')
      setBusy(null)
    }
  }

  // Renewal (still-active owner): go straight to checkout WITHOUT choosePlan so
  // the owner keeps their access; approval extends the current expiry.
  function renew() {
    const plan = planType === 'monthly' ? 'monthly' : 'yearly'
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
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isPaidActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {planType === 'yearly' ? <Crown size={22} /> : planType === 'monthly' ? <Timer size={22} /> : <Sparkles size={22} />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{bn ? 'বর্তমান প্ল্যান' : 'Current plan'}</p>
              <p className="text-xl font-bold text-slate-900">{planLabel}</p>
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
                {daysLeft === null ? '-' : daysLeft < 0 ? (bn ? 'শেষ' : 'Expired') : `${daysLeft} ${bn ? 'দিন' : 'day' + (daysLeft === 1 ? '' : 's')}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {isPaidActive ? (
        // Renew (active paid owner)
        <div className="card flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CalendarClock size={22} className="mt-0.5 text-slate-700" />
            <div>
              <h2 className="font-bold text-slate-900">{bn ? 'রিনিউ করুন' : 'Renew your plan'}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {bn
                  ? `রিনিউ করলে বিকাশ নম্বর ও QR দেখবেন, ট্রানজেকশন আইডি দিলে অ্যাডমিন অনুমোদন করবে। নতুন মেয়াদ ${formatDate(expiry)}-এর সাথে যোগ হবে।`
                  : `Renewing shows the bKash number + QR; submit your transaction ID and the admin approves. The new term stacks on top of ${formatDate(expiry)}.`}
              </p>
            </div>
          </div>
          <button onClick={renew} className="btn-primary shrink-0">
            <RefreshCw size={16} /> {bn ? `রিনিউ (${planLabel})` : `Renew (${planLabel})`}
          </button>
        </div>
      ) : (
        // Plan cards (trial / expired owner): Monthly (no discount) + Yearly
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlanCard
            icon={<Timer size={22} />}
            eyebrow={bn ? 'মাসিক প্ল্যান' : 'MONTHLY PLAN'}
            title={bn ? 'মাসিক' : 'Monthly'}
            price={prices ? `${money(prices.monthly)} / ${bn ? 'মাস' : 'month'}` : '...'}
            note={bn ? 'কোনো ডিসকাউন্ট নেই' : 'No discount'}
            features={[
              bn ? 'সম্পূর্ণ সফটওয়্যার অ্যাক্সেস' : 'Full software access',
              bn ? 'প্রতি মাসে বিল' : 'Billed every month',
              bn ? 'যেকোনো সময় ইয়ারলিতে আপগ্রেড' : 'Upgrade to yearly anytime',
            ]}
            onSelect={() => selectPlan('monthly')}
            busy={busy === 'monthly'}
          />
          <PlanCard
            icon={<Crown size={22} />}
            eyebrow={bn ? 'বার্ষিক প্ল্যান' : 'YEARLY PLAN'}
            title={bn ? 'বার্ষিক' : 'Yearly'}
            price={prices ? `${money(prices.yearly)} / ${bn ? 'বছর' : 'year'}` : '...'}
            note={bn ? 'সবচেয়ে সাশ্রয়ী' : 'Best value'}
            features={[
              bn ? 'সম্পূর্ণ আনলিমিটেড ফিচার' : 'All features unlocked',
              bn ? 'প্রায়োরিটি সাপোর্ট' : 'Priority support',
              bn ? 'এক বছরের জন্য এক পেমেন্ট' : 'One payment for a full year',
            ]}
            onSelect={() => selectPlan('yearly')}
            busy={busy === 'yearly'}
            highlighted
          />
        </div>
      )}
    </div>
  )
}

function PlanCard({
  icon, eyebrow, title, price, note, features, onSelect, busy, highlighted,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  price: string
  note: string
  features: string[]
  onSelect: () => void
  busy: boolean
  highlighted?: boolean
}) {
  return (
    <section className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${highlighted ? 'border-slate-900 ring-2 ring-slate-200' : 'border-slate-200'}`}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">{eyebrow}</span>
        <span className={`rounded-xl p-2 ${highlighted ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{icon}</span>
      </div>
      <h2 className="text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-2xl font-black text-slate-950">{price}</p>
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
        onClick={onSelect}
        disabled={busy}
        className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-colors disabled:opacity-60 ${highlighted ? 'bg-slate-900 text-white hover:bg-black' : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
      >
        <ShieldCheck size={16} /> {busy ? '...' : 'Choose'}
      </button>
    </section>
  )
}
