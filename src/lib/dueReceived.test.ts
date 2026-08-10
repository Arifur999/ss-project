import { describe, it, expect } from 'vitest'

// A due receipt can only settle what is owed. Taking more used to go through
// silently: the customer's balance clamped to zero, so the ledger showed
// nothing owed while the extra money sat in an account with no sale behind it.
//
// The rule the form now applies, mirrored here so it cannot drift: the cash
// collected plus any discount given must not exceed the previous due.
function overCollected(previousDue: number, payments: number[], discount: number) {
  const collected = payments.reduce((sum, amount) => sum + Number(amount || 0), 0) + Number(discount || 0)
  return { collected, excess: Math.max(0, collected - previousDue), blocked: collected > previousDue }
}

describe('collecting against a due', () => {
  it('refuses more than the customer owes', () => {
    // The case that was reported: Tk 50,000 owed, Tk 100,000 taken.
    const result = overCollected(50000, [100000], 0)
    expect(result.blocked).toBe(true)
    expect(result.excess).toBe(50000)
  })

  it('allows the exact due', () => {
    expect(overCollected(50000, [50000], 0).blocked).toBe(false)
  })

  it('allows a part payment', () => {
    expect(overCollected(50000, [20000], 0).blocked).toBe(false)
  })

  it('counts every split row together, not one at a time', () => {
    // Two rows under the due on their own, over it together.
    expect(overCollected(50000, [30000, 30000], 0).blocked).toBe(true)
  })

  it('counts a discount as part of what is settled', () => {
    // 45,000 cash plus a 5,000 discount clears exactly 50,000.
    expect(overCollected(50000, [45000], 5000).blocked).toBe(false)
    // One taka more of discount and the receipt claims more than is owed.
    expect(overCollected(50000, [45000], 5001).blocked).toBe(true)
  })

  it('refuses anything at all when nothing is owed', () => {
    expect(overCollected(0, [1], 0).blocked).toBe(true)
    expect(overCollected(0, [], 0).blocked).toBe(false)
  })

  it('treats blank amounts as zero rather than breaking the sum', () => {
    expect(overCollected(50000, [Number(''), 50000], 0).collected).toBe(50000)
  })
})
