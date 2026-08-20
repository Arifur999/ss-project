import { describe, expect, it } from 'vitest'
import { smsPackageLabel } from './smsPackageLabel'

describe('what the Current SMS package card says', () => {
  it('names the package once one has been bought', () => {
    const label = smsPackageLabel({ packageName: 'Starter 500', balance: 480, hasPaidPlan: true }, false)
    expect(label.value).toBe('Starter 500')
    expect(label.subtitle).toBeUndefined()
  })

  it('still names it after the credits have run out', () => {
    // It is the package they are on, whether or not there is anything left.
    expect(smsPackageLabel({ packageName: 'Starter 500', balance: 0, hasPaidPlan: true }, false).value)
      .toBe('Starter 500')
  })

  it('calls held credits what they are when nothing was bought', () => {
    // The case that read "None" beside a balance card saying 2.
    const label = smsPackageLabel({ packageName: null, balance: 2, hasPaidPlan: false }, false)
    expect(label.value).toBe('Free credits')
    expect(label.subtitle).toBe('Given to you at registration')
  })

  it('credits the plan when the owner is paying for one', () => {
    const label = smsPackageLabel({ packageName: null, balance: 100, hasPaidPlan: true }, false)
    expect(label.value).toBe('Free credits')
    expect(label.subtitle).toBe('Included with your plan')
  })

  it('asks for a purchase only when there is nothing left to send with', () => {
    const label = smsPackageLabel({ packageName: null, balance: 0, hasPaidPlan: false }, false)
    expect(label.value).toBe('No package bought')
    expect(label.subtitle).toBe('Buy one to start sending SMS')
  })

  it('does not guess where credits came from before the balance arrives', () => {
    const label = smsPackageLabel({ packageName: null, balance: null, hasPaidPlan: false }, false)
    expect(label.value).toBe('No package bought')
    expect(label.subtitle).toBeUndefined()
  })

  it('treats a blank package name as no package', () => {
    expect(smsPackageLabel({ packageName: '   ', balance: 5, hasPaidPlan: false }, false).value)
      .toBe('Free credits')
  })

  it('answers in Bangla when the site is in Bangla', () => {
    expect(smsPackageLabel({ packageName: null, balance: 2, hasPaidPlan: false }, true))
      .toEqual({ value: 'ফ্রি ক্রেডিট', subtitle: 'রেজিস্ট্রেশনের সময় দেওয়া' })
    expect(smsPackageLabel({ packageName: null, balance: 0, hasPaidPlan: true }, true))
      .toEqual({ value: 'কোনো প্যাকেজ কেনা হয়নি', subtitle: 'এসএমএস পাঠাতে একটি প্যাকেজ কিনুন' })
  })

  it('leaves a bought package name alone in Bangla too', () => {
    expect(smsPackageLabel({ packageName: 'Starter 500', balance: 10, hasPaidPlan: true }, true).value)
      .toBe('Starter 500')
  })
})
