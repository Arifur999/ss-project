import { describe, expect, it } from 'vitest'
import { investmentBelongsTo, netInvested, totalInvestment } from './shareholderCapital'

const arif = { id: 'sh1', name: 'Arifur Rahman', opening_amount: 2500000 }
const nasima = { id: 'sh3', name: 'Nasima Rahman', opening_amount: 1000000 }

describe('totalInvestment', () => {
  it('is the opening amount when nothing has moved', () => {
    expect(totalInvestment([], arif)).toBe(2500000)
  })

  it('adds what was invested', () => {
    const rows = [
      { shareholder_id: 'sh1', invest_amount: 300000, withdraw_amount: 0 },
      { shareholder_id: 'sh1', invest_amount: 200000, withdraw_amount: 0 },
    ]
    expect(totalInvestment(rows, arif)).toBe(3000000)
  })

  it('takes withdrawals back off, or it would claim money the business returned', () => {
    const rows = [
      { shareholder_id: 'sh1', invest_amount: 1000000, withdraw_amount: 0 },
      { shareholder_id: 'sh1', invest_amount: 0, withdraw_amount: 400000 },
    ]
    expect(totalInvestment(rows, arif)).toBe(3100000)
  })

  it('counts only this shareholder’s rows', () => {
    const rows = [
      { shareholder_id: 'sh1', invest_amount: 500000 },
      { shareholder_id: 'sh3', invest_amount: 900000 },
    ]
    expect(totalInvestment(rows, arif)).toBe(3000000)
    expect(totalInvestment(rows, nasima)).toBe(1900000)
  })

  it('still matches the older rows that carry a name but no id', () => {
    const rows = [{ shareholder_name: 'Nasima Rahman', invest_amount: 250000 }]
    expect(totalInvestment(rows, nasima)).toBe(1250000)
  })

  it('does not hand a nameless orphan row to somebody', () => {
    const rows = [{ invest_amount: 700000 }]
    expect(investmentBelongsTo(rows[0], arif)).toBe(false)
    expect(totalInvestment(rows, arif)).toBe(2500000)
  })

  it('reads a missing or string amount as a number', () => {
    const rows = [
      { shareholder_id: 'sh1', invest_amount: '150000' as any },
      { shareholder_id: 'sh1', withdraw_amount: null },
    ]
    expect(netInvested(rows, arif)).toBe(150000)
  })

  it('can go below the opening amount when more came out than went in', () => {
    const rows = [{ shareholder_id: 'sh3', invest_amount: 0, withdraw_amount: 1200000 }]
    expect(totalInvestment(rows, nasima)).toBe(-200000)
  })
})
