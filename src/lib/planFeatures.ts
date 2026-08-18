/**
 * What each subscription plan gives, and what it does not.
 *
 * Both plan pages (/choose-plan and /current-plan) read from here. They used to
 * carry their own lists, which had already drifted - the same plan promised
 * "Priority VIP tech support hotline" on one page and "Priority support" on the
 * other, and the trial's workspace line appeared on only one of them.
 *
 * `missing` is deliberate: a card that only lists what it includes leaves the
 * reader to work out what they lose by staying on the cheaper plan. Every
 * `missing` line on one plan should be an `included` line on a dearer one.
 *
 * The SMS figures here must match PLAN_SMS_CREDITS and SIGNUP_SMS_CREDITS in
 * hatim_Backend/src/app/utils/smsGrants.ts, which is what actually tops the
 * wallet up.
 */

export type PlanKey = 'free_trial' | 'monthly' | 'yearly'

export type PlanFeatures = {
  tagline: string
  included: string[]
  missing: string[]
}

export const PLAN_FEATURES: Record<'en' | 'bn', Record<PlanKey, PlanFeatures>> = {
  en: {
    free_trial: {
      tagline: 'For trying the software out',
      included: [
        'Full software access',
        '10 free SMS, once',
        'All reports & analytics',
        'Valid for 7 days',
      ],
      missing: [
        'Free SMS on every renewal',
        'Dedicated support',
        'Access after 7 days',
      ],
    },
    monthly: {
      tagline: 'For a business already running',
      included: [
        'Everything in the Free Trial',
        '100 free SMS every month',
        'Dedicated support',
        'Unlimited products, sales & customers',
        'Adds to your current expiry',
      ],
      missing: [
        '500 free SMS in one go',
        'Yearly discount',
      ],
    },
    yearly: {
      tagline: 'A full year, at the lowest price',
      included: [
        'All Monthly plan features',
        '500 free SMS every year',
        'Dedicated support',
        'Yearly discount - the best price',
        'Adds to your current expiry',
      ],
      missing: [],
    },
  },
  bn: {
    free_trial: {
      tagline: 'সফটওয়্যার যাচাই করে দেখার জন্য',
      included: [
        'সম্পূর্ণ সফটওয়্যার অ্যাক্সেস',
        '১০টি ফ্রি এসএমএস, একবার',
        'সব রিপোর্ট ও অ্যানালিটিক্স',
        '৭ দিনের জন্য',
      ],
      missing: [
        'প্রতিবার রিনিউয়ে ফ্রি এসএমএস',
        'ডেডিকেটেড সাপোর্ট',
        '৭ দিনের পর অ্যাক্সেস',
      ],
    },
    monthly: {
      tagline: 'চলমান ব্যবসার জন্য',
      included: [
        'ফ্রি ট্রায়ালের সবকিছু',
        'প্রতি মাসে ১০০টি ফ্রি এসএমএস',
        'ডেডিকেটেড সাপোর্ট',
        'আনলিমিটেড প্রোডাক্ট, সেলস ও কাস্টমার',
        'মেয়াদের সাথে যোগ হয়',
      ],
      missing: [
        'একসাথে ৫০০টি ফ্রি এসএমএস',
        'বার্ষিক ছাড়',
      ],
    },
    yearly: {
      tagline: 'পুরো এক বছর, সবচেয়ে কম দামে',
      included: [
        'মাসিক প্ল্যানের সব ফিচার',
        'প্রতি বছরে ৫০০টি ফ্রি এসএমএস',
        'ডেডিকেটেড সাপোর্ট',
        'বার্ষিক ছাড় - সেরা দাম',
        'মেয়াদের সাথে যোগ হয়',
      ],
      missing: [],
    },
  },
}

export function planFeatures(lang: 'en' | 'bn', plan: PlanKey): PlanFeatures {
  return PLAN_FEATURES[lang][plan]
}
