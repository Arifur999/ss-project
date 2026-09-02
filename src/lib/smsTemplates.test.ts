import { describe, expect, it } from 'vitest'
import { buildLoanTransactionSms, segmentsFor } from './smsTemplates'

// The loan pages sign a balance one way and one way only: positive is pawna
// (they owe us), negative is dena (we owe them). Get that backwards in a
// message and somebody is told they owe money they are in fact owed, so it is
// pinned down here rather than left to a reading of the component.

const base = {
  businessName: 'Hatim Furniture',
  businessPhone: '01711111111, 01722222222',
}

describe('buildLoanTransactionSms', () => {
  it('reads a negative balance as money we still owe them', () => {
    const message = buildLoanTransactionSms({
      ...base,
      type: 'payment',
      amount: 1_000,
      balanceAfter: -4_000,
    })

    expect(message).toContain('has paid you Tk 1,000')
    expect(message).toContain('Our due to you: Tk 4,000')
    expect(message).not.toContain('Your due to us')
  })

  it('reads a positive balance as money they owe us', () => {
    const message = buildLoanTransactionSms({
      ...base,
      type: 'receive',
      amount: 2_500,
      balanceAfter: 3_000,
    })

    expect(message).toContain('has received Tk 2,500 from you')
    expect(message).toContain('Your due to us: Tk 3,000')
    expect(message).not.toContain('Our due to you')
  })

  it('says settled rather than quoting a due of zero', () => {
    const message = buildLoanTransactionSms({ ...base, type: 'payment', amount: 500, balanceAfter: 0 })

    expect(message).toContain('Balance: settled in full')
    expect(message).not.toContain('Tk 0')
  })

  it('rounds before it reads the sign', () => {
    // A few paisa the wrong side of zero must not read as a due.
    expect(buildLoanTransactionSms({ ...base, type: 'payment', amount: 500, balanceAfter: -0.4 }))
      .toContain('Balance: settled in full')
    expect(buildLoanTransactionSms({ ...base, type: 'payment', amount: 500, balanceAfter: 0.4 }))
      .toContain('Balance: settled in full')
  })

  it('sends only the first helpline number, and copes with none', () => {
    // Settings stores both numbers in one field; a second one is just extra
    // characters charged on every send.
    expect(buildLoanTransactionSms({ ...base, type: 'payment', amount: 500, balanceAfter: -100 }))
      .toContain('Helpline: 01711111111')
    expect(buildLoanTransactionSms({ ...base, type: 'payment', amount: 500, balanceAfter: -100 }))
      .not.toContain('01722222222')

    const noPhone = buildLoanTransactionSms({
      businessName: 'Hatim Furniture', type: 'payment', amount: 500, balanceAfter: -100,
    })
    expect(noPhone).not.toContain('Helpline')
  })

  it('stays on the cheap side of the billing rules', () => {
    // Plain ASCII bills at 160 characters a segment where Bangla bills at 70.
    // One segment is one credit per recipient, so this is money.
    const message = buildLoanTransactionSms({
      ...base,
      type: 'payment',
      amount: 1_250_000,
      balanceAfter: -9_999_999,
    })

    expect(message).toMatch(/^[\x20-\x7E\n]*$/)
    expect(segmentsFor(message)).toBe(1)
  })
})
