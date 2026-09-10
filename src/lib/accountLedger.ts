import { roundTaka } from './utils'
import { saleRemainderForAccount, splitPaymentCoverage } from './balanceTabs'

// ---------------------------------------------------------------------------
// One cash or bank account, every movement through it, read like a passbook.
//
// The Balance Dashboard answers "what is in this account" with one number built
// by folding eleven tables. This answers "how did it get there" by laying the
// same eleven tables out as dated rows with a running balance.
//
// The rule that matters more than any other: the closing balance here MUST be
// the figure Balance.tsx shows for the same account. Two screens disagreeing
// about the money in one drawer is the worst outcome this file can produce, so
// every source below is added with the same sign and the same filter as
// Balance.tsx:116-141, and the test beside this asserts the two agree.
//
// Pure, so that test needs no browser and no database.
// ---------------------------------------------------------------------------

/** Which way the money went, from this account's point of view. */
export type LedgerDirection = 'in' | 'out'

export type AccountLedgerRow = {
  /** Sort key and what the Date column shows. */
  date: string
  /** The module it came from - Sale, Expense, Loan, Transfer... */
  kind: string
  /** Invoice number, SI number, whatever names the source document. */
  reference: string
  description: string
  direction: LedgerDirection
  amount: number
  /** What the account stood at after this row. Filled by buildAccountLedger. */
  balance: number
}

export type AccountLedgerSources = {
  investments: any[]
  profitWithdrawals: any[]
  loans: any[]
  transfers: any[]
  expenses: any[]
  sales: any[]
  salePayments: any[]
  customerPayments: any[]
  supplierPayments: any[]
  otherIncomes: any[]
}

export type AccountLedger = {
  opening: number
  rows: AccountLedgerRow[]
  total_in: number
  total_out: number
  closing: number
}

const num = (value: unknown) => roundTaka(value)
const day = (value: unknown) => String(value || '').slice(0, 10)
const text = (value: unknown) => String(value ?? '').trim()

/**
 * Every movement through one account, undated order, before the window is
 * applied.
 *
 * Split out from buildAccountLedger so the window logic below has one list to
 * work on, and so a caller wanting a raw feed can have one.
 */
export function accountMovements(accountId: string, sources: AccountLedgerSources): AccountLedgerRow[] {
  const rows: AccountLedgerRow[] = []
  const mine = (row: any) => row?.account_id === accountId

  const push = (
    row: any,
    kind: string,
    direction: LedgerDirection,
    amount: number,
    reference: string,
    description: string
  ) => {
    if (amount <= 0) return
    rows.push({ date: day(row.date), kind, reference, description, direction, amount, balance: 0 })
  }

  for (const row of sources.investments.filter(mine)) {
    push(row, 'Investment', 'in', num(row.invest_amount), text(row.shareholder_name), 'Capital in')
    push(row, 'Investment', 'out', num(row.withdraw_amount), text(row.shareholder_name), 'Capital withdrawn')
  }

  for (const row of sources.profitWithdrawals.filter(mine)) {
    push(row, 'Profit withdrawal', 'out', num(row.amount), text(row.shareholder_name), text(row.notes))
  }

  // Both columns off every loan row, profit and principal alike - a profit
  // payment is still cash leaving the drawer, which is why Balance.tsx reads
  // these two columns and not payment_category.
  for (const row of sources.loans.filter(mine)) {
    const who = text(row.lender_name)
    push(row, 'Loan received', 'in', num(row.received_amount), who, text(row.notes))
    push(row, 'Loan paid', 'out', num(row.payment_amount), who, text(row.notes))
  }

  for (const row of sources.expenses.filter(mine)) {
    push(row, 'Expense', 'out', num(row.amount), text(row.category_name), text(row.notes))
  }

  for (const row of sources.supplierPayments.filter(mine)) {
    push(row, 'Supplier paid', 'out', num(row.amount), text(row.supplier_name), text(row.purchase_si_no))
  }

  for (const row of sources.customerPayments.filter(mine)) {
    push(row, 'Due collected', 'in', num(row.amount), text(row.customer_name), text(row.notes))
  }

  for (const row of sources.otherIncomes.filter(mine)) {
    const who = text(row.supplier_name) || text(row.source_name)
    push(row, 'Other income', 'in', num(row.amount), who, text(row.notes))
  }

  // Sales reach an account two ways and they must not overlap: a split payment
  // row, and whatever of the sale's own paid_amount those rows do not cover.
  // Balance.tsx counts the remainder rather than dropping the whole sale, and
  // splitPaymentCoverage is the helper that decides how much is already spoken
  // for - the same one, so the two cannot drift.
  const countedSaleIds = new Set<string>(sources.sales.map((sale: any) => String(sale.id)))
  const covered = splitPaymentCoverage(sources.salePayments, countedSaleIds)

  for (const row of sources.sales.filter(mine)) {
    push(row, 'Sale', 'in', num(saleRemainderForAccount(row, covered)), text(row.invoice_no), text(row.customer_name))
  }

  for (const row of sources.salePayments.filter(mine)) {
    push(row, 'Sale payment', 'in', num(row.amount), text(row.invoice_no), text(row.customer_name))
  }

  for (const row of sources.transfers) {
    if (row?.to_account_id === accountId) {
      push(row, 'Transfer in', 'in', num(row.amount), text(row.from_account_name), text(row.notes))
    }
    if (row?.from_account_id === accountId) {
      push(row, 'Transfer out', 'out', num(row.amount), text(row.to_account_name), text(row.notes))
    }
  }

  return rows
}

/**
 * The passbook: opening balance, the movements in date order, running balance.
 *
 * `from` and `to` are inclusive day bounds. Everything before `from` is folded
 * into the opening figure rather than dropped, which is the whole point of a
 * statement - a September page has to start where August closed. A row with no
 * date sorts first, alongside the opening balance, because a movement whose
 * date was never recorded still happened.
 */
export function buildAccountLedger(input: {
  account: { id?: string | null; opening_balance?: unknown }
  sources: AccountLedgerSources
  from?: string
  to?: string
}): AccountLedger {
  const accountId = String(input.account?.id || '')
  const from = day(input.from)
  const to = day(input.to)

  const all = accountMovements(accountId, input.sources)
    .sort((a, b) => a.date.localeCompare(b.date))

  const before = from ? all.filter(row => row.date && row.date < from) : []
  const within = all.filter(row => {
    if (from && row.date && row.date < from) return false
    if (to && row.date && row.date > to) return false
    return true
  })

  const signed = (row: AccountLedgerRow) => (row.direction === 'in' ? row.amount : -row.amount)

  const opening = before.reduce(
    (sum, row) => sum + signed(row),
    num(input.account?.opening_balance)
  )

  let running = opening
  const rows = within.map(row => {
    running += signed(row)
    return { ...row, balance: running }
  })

  return {
    opening,
    rows,
    total_in: rows.filter(row => row.direction === 'in').reduce((sum, row) => sum + row.amount, 0),
    total_out: rows.filter(row => row.direction === 'out').reduce((sum, row) => sum + row.amount, 0),
    closing: running,
  }
}
