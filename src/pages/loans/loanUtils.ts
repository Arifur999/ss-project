export function lenderKeyFromLoan(loan: any) {
  return loan.lender_id || `name:${loan.lender_name || 'Unknown'}`
}

export function lenderKey(lender: any) {
  if (lender?.id?.startsWith?.('local:') || lender?.id?.startsWith?.('legacy:')) {
    return `name:${lender?.name || 'Unknown'}`
  }
  return lender?.id || `name:${lender?.name || 'Unknown'}`
}

export function loanDisplayName(loan: any) {
  return loan.loan_lenders?.name || loan.lender_name || 'Unknown'
}

export function loanDisplayType(loan: any) {
  return loan.loan_lenders?.lender_type || (loan.loan_type === 'personal' ? 'person' : loan.loan_type) || 'person'
}

/**
 * What one row moved, and which way.
 *
 * Mirrors shared/loanBalance.ts on the server - the two have to agree, because
 * this is what the transaction form previews before saving and that is what
 * the server will then compute. A row is profit or it is principal; the old
 * `interest` type and the never-finished `adjustment_*` pair are gone, and
 * with them a bug where interest was added with the SAME sign as a repayment,
 * so earning interest made a debt look smaller.
 */
export function transactionAmounts(loan: any) {
  const received = Number(loan.received_amount || 0)
  const paid = Number(loan.payment_amount || 0)
  const isProfit = String(loan.payment_category || 'principal') === 'profit'
  const type = loan.transaction_type || (received > 0 ? 'receive' : 'payment')

  return {
    type,
    isProfit,
    received: type === 'receive' ? received : 0,
    paid: type === 'payment' ? paid : 0,
    // What was earned, kept apart from what was lent. Signed the way the money
    // went: taking profit in is positive.
    profit: isProfit ? received - paid : 0,
    // Profit moves what is owed by nothing at all.
    balanceEffect: isProfit ? 0 : paid - received,
  }
}

export function transactionLabel(type: string) {
  return type === 'payment' ? 'Paid' : 'Received'
}

/** Principal or Profit, for a column that has to say which. */
export function categoryLabel(category: string) {
  return String(category || 'principal') === 'profit' ? 'Profit' : 'Principal'
}

export function loanBalanceLabel(amount: number) {
  if (amount < 0) return 'Dena'
  if (amount > 0) return 'Pawna'
  return 'Balanced'
}

export function loanBalanceColor(amount: number) {
  if (amount < 0) return 'text-brand-red'
  if (amount > 0) return 'text-brand-green'
  return 'text-slate-500'
}

export function buildLoanSummary(lenders: any[], loans: any[]) {
  const summary: Record<string, any> = {}

  lenders.forEach(lender => {
    const key = lenderKey(lender)
    summary[key] = {
      key,
      lender,
      name: lender.name,
      type: lender.lender_type,
      opening: Number(lender.opening_balance || 0),
      received: 0,
      paid: 0,
      profit: 0,
      balance: Number(lender.opening_balance || 0),
      transactions: 0,
    }
  })

  loans.forEach(loan => {
    const key = lenderKeyFromLoan(loan)
    if (!summary[key]) {
      summary[key] = {
        key,
        lender: null,
        name: loanDisplayName(loan),
        type: loanDisplayType(loan),
        opening: 0,
        received: 0,
        paid: 0,
        profit: 0,
        balance: 0,
        transactions: 0,
      }
    }

    const amounts = transactionAmounts(loan)
    summary[key].received += amounts.received
    summary[key].paid += amounts.paid
    summary[key].profit += amounts.profit
    summary[key].balance += amounts.balanceEffect
    summary[key].transactions += 1
  })

  return Object.values(summary)
}
