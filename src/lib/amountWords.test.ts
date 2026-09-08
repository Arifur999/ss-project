import { describe, it, expect } from 'vitest'
import { amountInWords, numberToWords } from './amountWords'

// This prints on a document somebody signs, so the grouping matters: crore and
// lakh, not million and billion. It had no test while it lived inside Sales.tsx
// and is now read by two printed pages, so a change that suits one of them has
// to answer to both.

describe('numberToWords', () => {
  it('spells zero rather than an empty string', () => {
    expect(numberToWords(0)).toBe('Zero')
  })

  it('handles the teens, which are not tens-plus-ones', () => {
    expect(numberToWords(13)).toBe('Thirteen')
    expect(numberToWords(19)).toBe('Nineteen')
  })

  it('joins tens and ones', () => {
    expect(numberToWords(42)).toBe('Forty Two')
  })

  it('groups in thousands, lakhs and crores', () => {
    expect(numberToWords(6_200)).toBe('Six Thousand Two Hundred')
    expect(numberToWords(39_420)).toBe('Thirty Nine Thousand Four Hundred Twenty')
    expect(numberToWords(1_00_000)).toBe('One Lakh')
    expect(numberToWords(1_25_00_000)).toBe('One Crore Twenty Five Lakh')
  })

  it('skips a group that is empty rather than saying "Zero Thousand"', () => {
    expect(numberToWords(1_00_042)).toBe('One Lakh Forty Two')
  })
})

describe('amountInWords', () => {
  it('matches what the Sales invoice has always printed', () => {
    expect(amountInWords(6_200)).toBe('Six Thousand Two Hundred Taka Only')
  })

  it('adds paisa only when there are any', () => {
    expect(amountInWords(100)).toBe('One Hundred Taka Only')
    expect(amountInWords(100.5)).toBe('One Hundred Taka and Fifty Paisa Only')
  })

  it('clamps a negative to zero - a bill total is never negative', () => {
    expect(amountInWords(-500)).toBe('Zero Taka Only')
  })

  it('reads a missing amount as zero', () => {
    expect(amountInWords(NaN)).toBe('Zero Taka Only')
  })
})
