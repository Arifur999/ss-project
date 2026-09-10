import { describe, it, expect } from 'vitest'
import { accountMovements, buildAccountLedger, type AccountLedgerSources } from './accountLedger'
import { saleRemainderForAccount, splitPaymentCoverage } from './balanceTabs'

// The one rule worth more than all the others: this ledger's closing balance is
// the number the Balance Dashboard shows for the same account. Two screens
// disagreeing about the money in one drawer is the failure this file exists to
// prevent, so the last test here recomputes Balance.tsx's own expression and
// asserts they land on the same figure.

const ACC = 'acc-cash'
const OTHER = 'acc-bank'

const empty: AccountLedgerSources = {
  investments: [], profitWithdrawals: [], loans: [], transfers: [], expenses: [],
  sales: [], salePayments: [], customerPayments: [], supplierPayments: [], otherIncomes: [],
}

const sources = (over: Partial<AccountLedgerSources>): AccountLedgerSources => ({ ...empty, ...over })

describe('accountMovements', () => {
  it('takes both loan columns off every row, profit included', () => {
    // Balance.tsx reads received_amount and payment_amount and never looks at
    // payment_category: a profit payment is still cash leaving the drawer.
    const rows = accountMovements(ACC, sources({
      loans: [
        { account_id: ACC, date: '2026-09-01', lender_name: 'Arif', received_amount: 5000, payment_amount: 0 },
        { account_id: ACC, date: '2026-09-02', lender_name: 'Arif', received_amount: 0, payment_amount: 1200, payment_category: 'profit' },
      ],
    }))
    expect(rows.map(r => [r.kind, r.direction, r.amount])).toEqual([
      ['Loan received', 'in', 5000],
      ['Loan paid', 'out', 1200],
    ])
  })

  it('splits an investment row into its two directions', () => {
    const rows = accountMovements(ACC, sources({
      investments: [{ account_id: ACC, date: '2026-09-01', shareholder_name: 'Habib', invest_amount: 50_000, withdraw_amount: 10_000 }],
    }))
    expect(rows.map(r => [r.direction, r.amount])).toEqual([['in', 50_000], ['out', 10_000]])
  })

  it('reads a transfer from both ends, by which account is looking', () => {
    const transfers = [{ from_account_id: ACC, to_account_id: OTHER, date: '2026-09-01', amount: 7000, from_account_name: 'Cash', to_account_name: 'Bank' }]
    expect(accountMovements(ACC, sources({ transfers }))[0]).toMatchObject({ kind: 'Transfer out', direction: 'out', amount: 7000 })
    expect(accountMovements(OTHER, sources({ transfers }))[0]).toMatchObject({ kind: 'Transfer in', direction: 'in', amount: 7000 })
  })

  it('ignores rows belonging to another account', () => {
    expect(accountMovements(ACC, sources({
      expenses: [{ account_id: OTHER, date: '2026-09-01', amount: 900, category_name: 'Rent' }],
    }))).toEqual([])
  })

  it('drops a zero movement rather than printing an empty line', () => {
    expect(accountMovements(ACC, sources({
      loans: [{ account_id: ACC, date: '2026-09-01', received_amount: 0, payment_amount: 0 }],
      expenses: [{ account_id: ACC, date: '2026-09-01', amount: 0 }],
    }))).toEqual([])
  })

  it('counts a sale only for what its split payments do not already cover', () => {
    // The overlap Balance.tsx guards against: paid_amount on the sale AND a
    // payment row for the same sale would otherwise both land in the account.
    const rows = accountMovements(ACC, sources({
      sales: [{ id: 's1', account_id: ACC, date: '2026-09-01', paid_amount: 10_000, invoice_no: 'INV-1' }],
      salePayments: [{ sale_id: 's1', account_id: ACC, date: '2026-09-01', amount: 4_000, invoice_no: 'INV-1' }],
    }))
    const total = rows.reduce((sum, r) => sum + r.amount, 0)
    expect(total).toBe(10_000)
  })
})

describe('buildAccountLedger', () => {
  const busy = sources({
    investments: [{ account_id: ACC, date: '2026-07-05', invest_amount: 100_000, withdraw_amount: 0 }],
    expenses: [
      { account_id: ACC, date: '2026-08-10', amount: 20_000, category_name: 'Rent' },
      { account_id: ACC, date: '2026-09-03', amount: 5_000, category_name: 'Wifi' },
    ],
    customerPayments: [{ account_id: ACC, date: '2026-09-02', amount: 8_000, customer_name: 'Jowel' }],
  })

  it('carries everything before the window into the opening figure', () => {
    const ledger = buildAccountLedger({
      account: { id: ACC, opening_balance: 5_000 },
      sources: busy,
      from: '2026-09-01',
      to: '2026-09-30',
    })
    // 5,000 opening + 100,000 invested - 20,000 rent, all before September.
    expect(ledger.opening).toBe(85_000)
    expect(ledger.rows).toHaveLength(2)
  })

  it('runs the balance forward, row by row', () => {
    const ledger = buildAccountLedger({
      account: { id: ACC, opening_balance: 5_000 },
      sources: busy,
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(ledger.rows.map(r => r.balance)).toEqual([93_000, 88_000])
    expect(ledger.total_in).toBe(8_000)
    expect(ledger.total_out).toBe(5_000)
    expect(ledger.closing).toBe(88_000)
  })

  it('closes one window exactly where the next one opens', () => {
    const august = buildAccountLedger({ account: { id: ACC, opening_balance: 5_000 }, sources: busy, from: '2026-08-01', to: '2026-08-31' })
    const september = buildAccountLedger({ account: { id: ACC, opening_balance: 5_000 }, sources: busy, from: '2026-09-01', to: '2026-09-30' })
    expect(september.opening).toBe(august.closing)
  })

  it('shows the whole history when no window is given', () => {
    const ledger = buildAccountLedger({ account: { id: ACC, opening_balance: 5_000 }, sources: busy })
    expect(ledger.opening).toBe(5_000)
    expect(ledger.rows).toHaveLength(4)
    expect(ledger.closing).toBe(88_000)
  })

  it('keeps an undated movement rather than losing it', () => {
    // A row whose date was never recorded still moved money. Dropping it would
    // make the closing balance disagree with the dashboard.
    const ledger = buildAccountLedger({
      account: { id: ACC, opening_balance: 0 },
      sources: sources({ expenses: [{ account_id: ACC, amount: 300, category_name: 'Others' }] }),
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(ledger.rows).toHaveLength(1)
    expect(ledger.closing).toBe(-300)
  })

  it('closes on the Balance Dashboard figure for the same account', () => {
    // Balance.tsx:140, recomputed here from the same rows. If this ever fails,
    // the two screens are telling the owner different things about one drawer.
    const account = { id: ACC, opening_balance: 12_000 }
    const data = sources({
      investments: [{ account_id: ACC, date: '2026-01-02', invest_amount: 200_000, withdraw_amount: 30_000 }],
      profitWithdrawals: [{ account_id: ACC, date: '2026-02-01', amount: 20_000 }],
      loans: [{ account_id: ACC, date: '2026-03-01', received_amount: 100_000, payment_amount: 40_000 }],
      supplierPayments: [{ account_id: ACC, date: '2026-04-01', amount: 150_000 }],
      sales: [{ id: 's1', account_id: ACC, date: '2026-05-01', paid_amount: 300_000 }],
      salePayments: [{ sale_id: 's1', account_id: ACC, date: '2026-05-01', amount: 120_000 }],
      customerPayments: [{ account_id: ACC, date: '2026-06-01', amount: 80_000 }],
      otherIncomes: [{ account_id: ACC, date: '2026-06-15', amount: 5_000 }],
      expenses: [{ account_id: ACC, date: '2026-07-01', amount: 25_000 }],
      transfers: [
        { to_account_id: ACC, from_account_id: OTHER, date: '2026-08-01', amount: 60_000 },
        { from_account_id: ACC, to_account_id: OTHER, date: '2026-08-02', amount: 15_000 },
      ],
    })

    const sumBy = (arr: any[], field: string) =>
      arr.filter(r => r.account_id === ACC).reduce((s, r) => s + Number(r[field] || 0), 0)
    const covered = splitPaymentCoverage(data.salePayments, new Set(data.sales.map((s: any) => String(s.id))))
    const cashSales =
      data.sales.filter((r: any) => r.account_id === ACC).reduce((s: number, r: any) => s + saleRemainderForAccount(r, covered), 0) +
      sumBy(data.salePayments, 'amount')

    const dashboard =
      Number(account.opening_balance)
      + sumBy(data.investments, 'invest_amount') - sumBy(data.investments, 'withdraw_amount')
      - sumBy(data.profitWithdrawals, 'amount')
      + sumBy(data.loans, 'received_amount') - sumBy(data.loans, 'payment_amount')
      - sumBy(data.supplierPayments, 'amount')
      + cashSales
      + sumBy(data.customerPayments, 'amount')
      + sumBy(data.otherIncomes, 'amount')
      - sumBy(data.expenses, 'amount')
      + data.transfers.filter((r: any) => r.to_account_id === ACC).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
      - data.transfers.filter((r: any) => r.from_account_id === ACC).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)

    expect(buildAccountLedger({ account, sources: data }).closing).toBe(dashboard)
  })
})
