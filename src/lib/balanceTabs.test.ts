import { describe, it, expect } from 'vitest'
import {
  BALANCE_TABS,
  MOVEMENT_KEYS,
  accountTotals,
  saleRemainderForAccount,
  splitPaymentCoverage,
  type AccountMovements,
} from './balanceTabs'

describe('how a sale reaches an account balance', () => {
  const completed = new Set(['s1', 's2'])

  it('counts the whole paid_amount when there are no split rows', () => {
    const covered = splitPaymentCoverage([], completed)
    expect(saleRemainderForAccount({ id: 's1', paid_amount: 50_000 }, covered)).toBe(50_000)
  })

  it('counts nothing extra when the split rows sum to the paid amount', () => {
    const covered = splitPaymentCoverage(
      [{ sale_id: 's1', amount: 30_000 }, { sale_id: 's1', amount: 20_000 }],
      completed
    )
    expect(saleRemainderForAccount({ id: 's1', paid_amount: 50_000 }, covered)).toBe(0)
  })

  it('counts the shortfall when the split rows fall short', () => {
    // The bug this replaces: an all-or-nothing guard excluded the sale's whole
    // paid_amount as soon as ANY payment row existed, so one stray Tk 1 row
    // against a Tk 50,000 sale wiped Tk 50,000 off the account balance.
    const covered = splitPaymentCoverage([{ sale_id: 's1', amount: 1 }], completed)
    expect(saleRemainderForAccount({ id: 's1', paid_amount: 50_000 }, covered)).toBe(49_999)
  })

  it('never counts a negative when the split rows overshoot', () => {
    const covered = splitPaymentCoverage([{ sale_id: 's1', amount: 60_000 }], completed)
    expect(saleRemainderForAccount({ id: 's1', paid_amount: 50_000 }, covered)).toBe(0)
  })

  it('keeps each sale independent', () => {
    const covered = splitPaymentCoverage(
      [{ sale_id: 's1', amount: 50_000 }, { sale_id: 's2', amount: 1_000 }],
      completed
    )
    expect(saleRemainderForAccount({ id: 's1', paid_amount: 50_000 }, covered)).toBe(0)
    expect(saleRemainderForAccount({ id: 's2', paid_amount: 8_000 }, covered)).toBe(7_000)
  })

  it('ignores payments belonging to a sale the page is not counting', () => {
    // Sales are filtered to status 'completed'; the payment rows were not, so a
    // sale patched to another status kept feeding its payments into the balance
    // while its own paid_amount had dropped out.
    const covered = splitPaymentCoverage([{ sale_id: 'not-completed', amount: 9_000 }], completed)
    expect(covered.size).toBe(0)
  })

  it('leaves a payment with no sale_id out of the coverage map', () => {
    // It is still money in an account and is summed directly elsewhere; it just
    // does not offset any particular sale.
    const covered = splitPaymentCoverage([{ sale_id: null, amount: 9_000 }], completed)
    expect(covered.size).toBe(0)
  })

  it('rounds to the whole taka on the way in', () => {
    const covered = splitPaymentCoverage([{ sale_id: 's1', amount: '10.4' }], completed)
    expect(covered.get('s1')).toBe(10)
    expect(saleRemainderForAccount({ id: 's1', paid_amount: 100.5 }, covered)).toBe(91)
  })

  it('treats a missing paid_amount as zero rather than NaN', () => {
    const covered = splitPaymentCoverage([], completed)
    expect(saleRemainderForAccount({ id: 's1' }, covered)).toBe(0)
    expect(saleRemainderForAccount({ id: 's1', paid_amount: null }, covered)).toBe(0)
  })
})

// Splitting one table into five can silently drop a column or count one twice,
// and nothing on screen would look wrong - the balance would just quietly stop
// being the sum of its parts. These are the checks that catch it.

/** Builds a row and computes its balance the same way the page does. */
function row(fields: Partial<AccountMovements> = {}): AccountMovements {
  const base = {
    opening_balance: 0,
    total_invest: 0, invest_withdraw: 0, profit_withdraw: 0,
    loan_received: 0, loan_payment: 0,
    supplier_payment: 0, cash_sales: 0, customer_due_received: 0,
    other_income: 0, expense_pay: 0, transfer_in: 0, transfer_out: 0,
    ...fields,
  }
  const current_balance =
    base.opening_balance
    + base.total_invest - base.invest_withdraw - base.profit_withdraw
    + base.loan_received - base.loan_payment
    - base.supplier_payment + base.cash_sales + base.customer_due_received
    + base.other_income - base.expense_pay
    + base.transfer_in - base.transfer_out
  return { ...base, current_balance }
}

const CASES: [string, AccountMovements][] = [
  ['an ordinary account', row({
    opening_balance: 50_000,
    total_invest: 200_000, invest_withdraw: 30_000, profit_withdraw: 20_000,
    loan_received: 100_000, loan_payment: 40_000,
    supplier_payment: 150_000, cash_sales: 300_000, customer_due_received: 80_000,
    other_income: 5_000, expense_pay: 25_000, transfer_in: 60_000, transfer_out: 15_000,
  })],
  ['every field zero', row()],
  ['a negative balance', row({ opening_balance: 10_000, expense_pay: 90_000 })],
  // One tab deep in the red while the account overall is fine - the case where
  // a sign error in a single tab would otherwise hide.
  ['one tab negative, balance positive', row({
    opening_balance: 0,
    cash_sales: 500_000,
    total_invest: 10_000, invest_withdraw: 90_000,
  })],
  ['only transfers', row({ transfer_in: 15_000, transfer_out: 15_000 })],
]

describe('accountTotals', () => {
  it.each(CASES)('opening + in - out === current balance: %s', (_label, account) => {
    const totals = accountTotals(account)
    expect(account.opening_balance + totals.total_in - totals.total_out)
      .toBe(account.current_balance)
  })

  it.each(CASES)('opening + the four tab nets === current balance: %s', (_label, account) => {
    const { owner_net, loan_net, trade_net, others_net } = accountTotals(account)
    expect(account.opening_balance + owner_net + loan_net + trade_net + others_net)
      .toBe(account.current_balance)
  })

  it('reads a missing or unusable field as zero rather than NaN', () => {
    const totals = accountTotals({ total_invest: undefined, cash_sales: NaN as never, loan_received: 500 })
    expect(totals.total_in).toBe(500)
    expect(Number.isFinite(totals.owner_net)).toBe(true)
  })

  it('keeps a tab net negative when more went out than came in', () => {
    const totals = accountTotals(row({ total_invest: 10_000, invest_withdraw: 90_000 }))
    expect(totals.owner_net).toBe(-80_000)
  })
})

describe('BALANCE_TABS', () => {
  const everyColumnKey = BALANCE_TABS.flatMap(tab => tab.columns.map(column => column.key))

  it('shows every movement column exactly once across the five tabs', () => {
    for (const key of MOVEMENT_KEYS) {
      const appearances = everyColumnKey.filter(columnKey => columnKey === key).length
      expect(`${key}: ${appearances}`).toBe(`${key}: 1`)
    }
  })

  it('does not show a column that is not a real field', () => {
    const known = new Set<string>([
      ...MOVEMENT_KEYS, 'opening_balance', 'current_balance',
      'total_in', 'total_out', 'owner_net', 'loan_net', 'trade_net', 'others_net',
    ])
    for (const key of everyColumnKey) expect(known.has(key)).toBe(true)
  })

  it('opens on At a Glance', () => {
    expect(BALANCE_TABS[0].key).toBe('glance')
  })

  it('closes every tab with exactly one closing figure', () => {
    for (const tab of BALANCE_TABS) {
      const closing = tab.columns.filter(column => column.closing)
      expect(`${tab.key}: ${closing.length}`).toBe(`${tab.key}: 1`)
      // And it is the last column, where a closing figure belongs.
      expect(tab.columns[tab.columns.length - 1].closing).toBe(true)
    }
  })

  it('marks each column as money in, money out, or neither', () => {
    for (const tab of BALANCE_TABS) {
      for (const column of tab.columns) {
        expect(['in', 'out', 'none']).toContain(column.flow)
        // A closing figure is a result, not a movement, so it gets no arrow.
        if (column.closing) expect(column.flow).toBe('none')
      }
    }
  })
})
