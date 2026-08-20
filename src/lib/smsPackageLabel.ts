/**
 * What the "Current SMS package" card should read.
 *
 * Credits reach a wallet three ways, and only one of them is a package: ten
 * free at registration, a grant on every approved paid-plan payment, and a
 * bought SMS package (see the backend's utils/smsGrants). So an owner can hold
 * credits while being on no package at all - which the card reported as
 * "None", reading as "you have nothing" right beside a balance card saying
 * otherwise.
 */
export type SmsPackageState = {
  /** The most recent approved SMS package purchase, if there is one. */
  packageName?: string | null
  /** Credits left in the wallet, or null while that is unknown. */
  balance: number | null
  /** Whether any paid plan payment has been approved - those carry credits too. */
  hasPaidPlan: boolean
}

export type SmsPackageLabel = { value: string; subtitle?: string }

export function smsPackageLabel(state: SmsPackageState, bn: boolean): SmsPackageLabel {
  const bought = (state.packageName || '').trim()
  if (bought) return { value: bought }

  const noPackage = bn ? 'কোনো প্যাকেজ কেনা হয়নি' : 'No package bought'

  // The balance has not arrived. We know there is no package, but not where
  // any credits came from, so say only the part we are sure of.
  if (state.balance === null) return { value: noPackage }

  if (state.balance > 0) {
    return {
      value: bn ? 'ফ্রি ক্রেডিট' : 'Free credits',
      subtitle: state.hasPaidPlan
        ? (bn ? 'আপনার প্ল্যানের সাথে দেওয়া' : 'Included with your plan')
        : (bn ? 'রেজিস্ট্রেশনের সময় দেওয়া' : 'Given to you at registration'),
    }
  }

  return {
    value: noPackage,
    subtitle: bn ? 'এসএমএস পাঠাতে একটি প্যাকেজ কিনুন' : 'Buy one to start sending SMS',
  }
}
