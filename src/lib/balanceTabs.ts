/**
 * The Balance overview, split into five readable tables.
 *
 * One table carrying sixteen columns put Current Balance - the figure the page
 * exists to show - furthest to the right, past everything else and behind a
 * horizontal scrollbar. These group the columns that belong together.
 *
 * Splitting one table into five is exactly the change that can silently drop a
 * column or count one twice, and nothing on screen would look wrong. The two
 * identities at the bottom of this file are what catch that, and the tests
 * assert them directly - which is why the arithmetic lives here as pure
 * functions rather than inline in the page.
 */
import { roundTaka } from './utils'

/** Every movement field a row carries, in and out. */
export interface AccountMovements {
  opening_balance: number
  total_invest: number
  invest_withdraw: number
  profit_withdraw: number
  loan_received: number
  loan_payment: number
  supplier_payment: number
  cash_sales: number
  customer_due_received: number
  other_income: number
  expense_pay: number
  transfer_in: number
  transfer_out: number
  current_balance: number
}

/** The six figures the tabs show that are not stored on the row. */
export interface AccountTotals {
  total_in: number
  total_out: number
  owner_net: number
  loan_net: number
  trade_net: number
  others_net: number
}

// Rounded to the whole taka on the way in, so the four nets below and the
// balance they add up to are all whole numbers. Rounding each net at display
// time instead would let the printed nets disagree with the printed balance by
// a taka, and identity (2) in the tests would no longer be checkable by eye.
const money = (value: unknown): number => roundTaka(value)

/**
 * The derived figures, all from fields already on the row.
 *
 * Every one of the twelve movement fields appears in exactly one of the four
 * nets, with the sign it has in the balance - that is what makes identity (2)
 * below hold, and what proves no column was lost or double-counted when the
 * table was split.
 */
export function accountTotals(row: Partial<AccountMovements>): AccountTotals {
  const invest = money(row.total_invest)
  const investWithdraw = money(row.invest_withdraw)
  const profitWithdraw = money(row.profit_withdraw)
  const loanReceived = money(row.loan_received)
  const loanPaid = money(row.loan_payment)
  const supplierPayment = money(row.supplier_payment)
  const cashSales = money(row.cash_sales)
  const collection = money(row.customer_due_received)
  const otherIncome = money(row.other_income)
  const expensePaid = money(row.expense_pay)
  const transferIn = money(row.transfer_in)
  const transferOut = money(row.transfer_out)

  return {
    total_in: invest + loanReceived + cashSales + collection + otherIncome + transferIn,
    total_out: investWithdraw + profitWithdraw + loanPaid + supplierPayment + expensePaid + transferOut,
    owner_net: invest - investWithdraw - profitWithdraw,
    loan_net: loanReceived - loanPaid,
    trade_net: cashSales + collection - supplierPayment,
    others_net: otherIncome - expensePaid + transferIn - transferOut,
  }
}

/** How a figure moves money, which decides the arrow beside it. */
export type Flow = 'in' | 'out' | 'none'

export interface BalanceColumn {
  key: keyof AccountMovements | keyof AccountTotals
  labelKey: string
  color: string
  flow: Flow
  /** The closing figure of its tab - drawn heavier, with a status dot. */
  closing?: boolean
}

export interface BalanceTab {
  key: string
  labelKey: string
  columns: BalanceColumn[]
}

const IN = 'text-brand-green'
const OUT = 'text-brand-red'
const NEUTRAL = ''
const CLOSING = 'font-bold text-navy-900'

export const BALANCE_TABS: BalanceTab[] = [
  {
    key: 'glance',
    labelKey: 'balance_tabGlance',
    columns: [
      { key: 'opening_balance', labelKey: 'balance_openingBalance', color: NEUTRAL, flow: 'none' },
      { key: 'total_in', labelKey: 'balance_totalIn', color: IN, flow: 'in' },
      { key: 'total_out', labelKey: 'balance_totalOut', color: OUT, flow: 'out' },
      { key: 'current_balance', labelKey: 'balance_currentBalance', color: CLOSING, flow: 'none', closing: true },
    ],
  },
  {
    key: 'owner',
    labelKey: 'balance_tabOwnerFunds',
    columns: [
      { key: 'opening_balance', labelKey: 'balance_openingBalance', color: NEUTRAL, flow: 'none' },
      { key: 'total_invest', labelKey: 'balance_investment', color: IN, flow: 'in' },
      { key: 'invest_withdraw', labelKey: 'balance_withdrawal', color: OUT, flow: 'out' },
      { key: 'profit_withdraw', labelKey: 'balance_profitWithdrawal', color: OUT, flow: 'out' },
      { key: 'owner_net', labelKey: 'balance_net', color: CLOSING, flow: 'none', closing: true },
    ],
  },
  {
    key: 'loans',
    labelKey: 'balance_tabLoans',
    columns: [
      { key: 'loan_received', labelKey: 'balance_loanReceived', color: IN, flow: 'in' },
      { key: 'loan_payment', labelKey: 'balance_loanPaid', color: OUT, flow: 'out' },
      { key: 'loan_net', labelKey: 'balance_netLoan', color: CLOSING, flow: 'none', closing: true },
    ],
  },
  {
    key: 'trade',
    labelKey: 'balance_tabSalesBuying',
    columns: [
      { key: 'cash_sales', labelKey: 'balance_cashSales', color: IN, flow: 'in' },
      { key: 'customer_due_received', labelKey: 'balance_customerCollection', color: IN, flow: 'in' },
      { key: 'supplier_payment', labelKey: 'balance_supplierPayment', color: OUT, flow: 'out' },
      { key: 'trade_net', labelKey: 'balance_netTrade', color: CLOSING, flow: 'none', closing: true },
    ],
  },
  {
    key: 'others',
    labelKey: 'balance_tabOthers',
    columns: [
      { key: 'other_income', labelKey: 'balance_otherIncome', color: IN, flow: 'in' },
      { key: 'expense_pay', labelKey: 'balance_expensePaid', color: OUT, flow: 'out' },
      { key: 'transfer_in', labelKey: 'balance_transferIn', color: IN, flow: 'in' },
      { key: 'transfer_out', labelKey: 'balance_transferOut', color: OUT, flow: 'out' },
      { key: 'others_net', labelKey: 'balance_net', color: CLOSING, flow: 'none', closing: true },
    ],
  },
]

/**
 * The twelve movement fields, each of which has to appear in exactly one tab.
 * Opening and Current Balance are excluded: opening is a starting point shown
 * on two tabs by design, and current balance is a closing figure, not a
 * movement.
 */
export const MOVEMENT_KEYS: (keyof AccountMovements)[] = [
  'total_invest', 'invest_withdraw', 'profit_withdraw',
  'loan_received', 'loan_payment',
  'supplier_payment', 'cash_sales', 'customer_due_received',
  'other_income', 'expense_pay', 'transfer_in', 'transfer_out',
]
