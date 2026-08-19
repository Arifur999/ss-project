import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CrownIcon as Crown, SparkleIcon as Sparkles, TimerIcon as Timer } from '@phosphor-icons/react'
import PageHeader from '../components/PageHeader'
import PlanCard from '../components/PlanCard'
import { planFeatures } from '../lib/planFeatures'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { getPaymentInfo } from '../services/admin.services'
import { formatDate as formatDateUtil, roundTaka } from '../lib/utils'
import { FALLBACK_PLAN_PRICES } from '../lib/planPricing'

// Must match SubscriptionPlans / SubscriptionCheckout so the checkout page can
// read which plan the owner is paying for.
const CHECKOUT_STORAGE_KEY = 'subscription_checkout_plan'

const money = (n: number) => 'Tk ' + roundTaka(n).toLocaleString('en-US')
const formatDate = (value?: string | null) => formatDateUtil(value) || '-'

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
      .catch(() => setPrices({
        monthly: FALLBACK_PLAN_PRICES.monthly,
        yearly: FALLBACK_PLAN_PRICES.yearly,
        yearlyOriginal: FALLBACK_PLAN_PRICES.yearlyOriginal,
      }))
  }, [])

  const planType = (subscription?.plan_type || 'free_trial') as PlanKind
  const isActive = subscriptionStatus === 'active'
  const expiry = subscription?.expiry_date || null
  const daysLeft = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null

  const features = (plan: PlanKind) => planFeatures(bn ? 'bn' : 'en', plan)
  const activeLabel = bn ? 'অ্যাক্টিভ' : 'Active'
  const buyLabel = bn ? 'কিনুন / রিনিউ' : 'Choose / Renew'

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
    <div className="min-h-screen bg-white p-6">
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

      {/* Three plan cards, always shown.
          Held to 80% of the page and centred: at full width each card is wide
          and squat, and a pricing card reads better tall. */}
      <div className="mx-auto grid w-full grid-cols-1 gap-5 lg:w-4/5 lg:grid-cols-3">
        <PlanCard
          icon={<Sparkles size={22} weight="duotone" />}
          title={bn ? 'ফ্রি ট্রায়াল' : 'Free Trial'}
          tagline={features('free_trial').tagline}
          price={bn ? 'ফ্রি' : 'Free'}
          period={bn ? '/ ৭ দিন' : '/ 7 days'}
          included={features('free_trial').included}
          missing={features('free_trial').missing}
          buttonLabel={planType === 'free_trial' && isActive ? activeLabel : (bn ? 'একবারই ব্যবহারযোগ্য' : 'One-time only')}
          isCurrent={planType === 'free_trial' && isActive}
          currentLabel={activeLabel}
          // Free trial is NEVER purchasable from here - always disabled.
          disabled
        />
        <PlanCard
          icon={<Timer size={22} weight="duotone" />}
          title={bn ? 'মাসিক' : 'Monthly'}
          tagline={features('monthly').tagline}
          price={prices ? money(prices.monthly) : '...'}
          period={bn ? '/ মাস' : '/ month'}
          included={features('monthly').included}
          missing={features('monthly').missing}
          buttonLabel={planType === 'monthly' && isActive ? activeLabel : buyLabel}
          isCurrent={planType === 'monthly' && isActive}
          currentLabel={activeLabel}
          onSelect={() => goToCheckout('monthly')}
        />
        <PlanCard
          icon={<Crown size={22} weight="duotone" />}
          title={bn ? 'বার্ষিক' : 'Yearly'}
          tagline={features('yearly').tagline}
          price={prices ? money(prices.yearly) : '...'}
          period={bn ? '/ বছর' : '/ year'}
          originalPrice={prices && prices.yearlyOriginal > prices.yearly ? money(prices.yearlyOriginal) : undefined}
          discountLabel={prices && prices.yearlyOriginal > prices.yearly
            ? `${Math.round((1 - prices.yearly / prices.yearlyOriginal) * 100)}% ${bn ? 'ছাড়' : 'OFF'}`
            : undefined}
          included={features('yearly').included}
          missing={features('yearly').missing}
          buttonLabel={planType === 'yearly' && isActive ? activeLabel : buyLabel}
          isCurrent={planType === 'yearly' && isActive}
          currentLabel={activeLabel}
          onSelect={() => goToCheckout('yearly')}
          popular
          popularLabel={bn ? 'জনপ্রিয়' : 'Popular'}
        />
      </div>
    </div>
  )
}
