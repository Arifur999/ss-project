import { describe, expect, it } from 'vitest'
import { buildLoanAccountSms, buildLoanTransactionSms, segmentsFor } from './smsTemplates'

// One rule decides the wording of both messages, and getting it backwards tells
// somebody they owe money they are in fact owed:
//
//   positive principal -> they owe us -> "Your Due Balance"
//   negative principal -> we owe them -> "Your Current Balance"
//
// It is pinned from both sides here, and from the boundary between them.

const base = {
  businessName: 'Hatim Furniture',
  businessPhone: '01711111111, 01722222222',
  customerName: 'Khaled Mahmud',
}

describe('buildLoanTransactionSms', () => {
  it('calls it a Due Balance when they owe us', () => {
    const message = buildLoanTransactionSms({ ...base, amount: 5_000, principalAfter: 70_000 })

    expect(message).toContain('Your Due Balance: Tk 70,000')
    expect(message).not.toContain('Current Balance')
  })

  it('calls it a Current Balance when we owe them', () => {
    const message = buildLoanTransactionSms({ ...base, amount: 5_000, principalAfter: -70_000 })

    expect(message).toContain('Your Current Balance: Tk 70,000')
    expect(message).not.toContain('Due Balance')
  })

  it('never prints the minus sign the direction already carries', () => {
    // The word says which way it goes; a negative figure beside it would read
    // as a second, contradictory statement.
    expect(buildLoanTransactionSms({ ...base, amount: 1, principalAfter: -4_765 })).not.toContain('-4,765')
  })

  it('reads a settled account as a Current Balance of nothing', () => {
    const message = buildLoanTransactionSms({ ...base, amount: 2_000, principalAfter: 0 })

    expect(message).toContain('Your Current Balance: Tk 0')
  })

  it('does not let a few paisa flip the wording', () => {
    expect(buildLoanTransactionSms({ ...base, amount: 1, principalAfter: 0.4 }))
      .toContain('Your Current Balance: Tk 0')
    expect(buildLoanTransactionSms({ ...base, amount: 1, principalAfter: -0.4 }))
      .toContain('Your Current Balance: Tk 0')
  })

  it('names the shop and the person, and states what moved', () => {
    const message = buildLoanTransactionSms({ ...base, amount: 12_500, principalAfter: -70_000 })

    expect(message.split('\n')[0]).toBe('Hatim Furniture')
    expect(message).toContain('Dear Khaled Mahmud, your transaction of Tk 12,500 has been processed.')
  })
})

describe('buildLoanAccountSms', () => {
  it('welcomes them with the balance the account opens on', () => {
    const message = buildLoanAccountSms({ ...base, principal: 9_910 })

    expect(message).toContain('Dear Khaled Mahmud, your account has been created successfully.')
    expect(message).toContain('Your Due Balance: Tk 9,910')
  })

  it('switches wording for an account we owe on', () => {
    expect(buildLoanAccountSms({ ...base, principal: -500 })).toContain('Your Current Balance: Tk 500')
  })
})

describe('the helpline line', () => {
  it('sends only the first of the two numbers Settings stores', () => {
    const message = buildLoanTransactionSms({ ...base, amount: 1, principalAfter: 100 })

    expect(message).toContain('Helpline: 01711111111')
    expect(message).not.toContain('01722222222')
  })

  it('leaves the line out entirely when Settings carries no number', () => {
    const message = buildLoanTransactionSms({
      businessName: 'Hatim Furniture', customerName: 'Khaled Mahmud',
      amount: 1, principalAfter: 100,
    })

    expect(message).not.toContain('Helpline')
  })
})

describe('what these cost to send', () => {
  it('costs three credits a recipient, where plain ASCII would cost one', () => {
    // The card emoji is the whole cost story. One non-ASCII character puts the
    // ENTIRE message on unicode billing - 67 characters a segment instead of
    // 153 - so this lands on 3 segments where the same text without the emoji
    // would fit in 1. Three credits a recipient instead of one.
    //
    // Pinned deliberately: the price of this message is a decision the owner
    // made, and it should change on purpose rather than turn up on an invoice.
    const typical = buildLoanTransactionSms({
      businessName: 'Hatim Furniture', businessPhone: '01711111111',
      customerName: 'Khaled Mahmud', amount: 5_000, principalAfter: -70_000,
    })

    expect(segmentsFor(typical)).toBe(3)
  })

  it('a long name and huge figures still fit four', () => {
    const worst = buildLoanTransactionSms({
      businessName: 'Hatim Furniture and Interior Decoration',
      businessPhone: '01711111111',
      customerName: 'Mohammad Khaled Mahmud Chowdhury',
      amount: 1_250_000, principalAfter: -9_999_999,
    })

    expect(segmentsFor(worst)).toBeLessThanOrEqual(4)
  })
})
