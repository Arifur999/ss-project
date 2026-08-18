import { describe, it, expect } from 'vitest'
import { PLAN_FEATURES, planFeatures, type PlanKey } from './planFeatures'

const LANGS = ['en', 'bn'] as const
const PLANS: PlanKey[] = ['free_trial', 'monthly', 'yearly']

describe('planFeatures', () => {
  it('covers every plan in both languages', () => {
    for (const lang of LANGS) {
      for (const plan of PLANS) {
        const entry = planFeatures(lang, plan)
        expect(entry, `${lang}/${plan}`).toBeDefined()
        expect(entry.tagline.trim().length, `${lang}/${plan} tagline`).toBeGreaterThan(0)
        expect(entry.included.length, `${lang}/${plan} included`).toBeGreaterThan(0)
      }
    }
  })

  it('gives the two languages the same shape', () => {
    // A plan that lists five things in English and three in Bangla means one
    // language is quietly promising less than the other.
    for (const plan of PLANS) {
      expect(PLAN_FEATURES.bn[plan].included.length, `${plan} included`).toBe(PLAN_FEATURES.en[plan].included.length)
      expect(PLAN_FEATURES.bn[plan].missing.length, `${plan} missing`).toBe(PLAN_FEATURES.en[plan].missing.length)
    }
  })

  it('never lists the same line as both included and missing', () => {
    for (const lang of LANGS) {
      for (const plan of PLANS) {
        const { included, missing } = planFeatures(lang, plan)
        const overlap = included.filter(line => missing.includes(line))
        expect(overlap, `${lang}/${plan}`).toEqual([])
      }
    }
  })

  it('has no repeated lines within one card', () => {
    for (const lang of LANGS) {
      for (const plan of PLANS) {
        const { included, missing } = planFeatures(lang, plan)
        // The card renders these with the line as the React key, so a duplicate
        // is a runtime warning as well as a reading problem.
        const all = [...included, ...missing]
        expect(new Set(all).size, `${lang}/${plan}`).toBe(all.length)
      }
    }
  })

  it('leaves the dearest plan with nothing missing', () => {
    for (const lang of LANGS) {
      expect(planFeatures(lang, 'yearly').missing, lang).toEqual([])
    }
  })

  it('tells the free trial what the paid plans add', () => {
    // The point of the missing list is that it names something a dearer plan
    // has - otherwise it is just bad news with nowhere to go.
    for (const lang of LANGS) {
      expect(planFeatures(lang, 'free_trial').missing.length, lang).toBeGreaterThan(0)
      expect(planFeatures(lang, 'monthly').missing.length, lang).toBeGreaterThan(0)
    }
  })

  it('quotes the SMS bundles the backend actually grants', () => {
    // These must match PLAN_SMS_CREDITS / SIGNUP_SMS_CREDITS in
    // hatim_Backend/src/app/utils/smsGrants.ts - the card is a promise the
    // wallet has to keep.
    const en = PLAN_FEATURES.en
    expect(en.free_trial.included.some(line => line.includes('10 free SMS'))).toBe(true)
    expect(en.monthly.included.some(line => line.includes('100 free SMS'))).toBe(true)
    expect(en.yearly.included.some(line => line.includes('500 free SMS'))).toBe(true)
  })

  it('promises dedicated support on both paid plans and not on the trial', () => {
    const en = PLAN_FEATURES.en
    expect(en.monthly.included.some(line => line.includes('Dedicated support'))).toBe(true)
    expect(en.yearly.included.some(line => line.includes('Dedicated support'))).toBe(true)
    expect(en.free_trial.included.some(line => line.includes('Dedicated support'))).toBe(false)
    expect(en.free_trial.missing.some(line => line.includes('Dedicated support'))).toBe(true)
  })
})
