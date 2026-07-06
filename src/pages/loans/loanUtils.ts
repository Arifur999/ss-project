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

export function transactionAmounts(loan: any) {
  const received = Number(loan.received_amount || 0)
  const paid = Number(loan.payment_amount || 0)
  const interest = Number(loan.interest_amount || 0)
  const type = loan.transaction_type || (received > 0 ? 'receive' : paid > 0 ? 'payment' : interest > 0 ? 'interest' : 'receive')

  return {
    type,
    received: type === 'receive' || type === 'adjustment_add' ? received : 0,
    paid: type === 'payment' || type === 'adjustment_deduct' ? paid : 0,
    interest: type === 'interest' ? interest : 0,
    balanceEffect:
      (type === 'payment' || type === 'adjustment_add' ? paid : 0) +
      (type === 'interest' ? interest : 0) -
      (type === 'receive' || type === 'adjustment_deduct' ? received : 0),
  }
}

export function transactionLabel(type: string) {
  const labels: Record<string, string> = {
    receive: 'Receive',
    payment: 'Payment',
    interest: 'Interest',
    adjustment_add: 'Adjustment (+)',
    adjustment_deduct: 'Adjustment (-)',
  }
  return labels[type] || 'Receive'
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
      interest: 0,
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
        interest: 0,
        balance: 0,
        transactions: 0,
      }
    }

    const amounts = transactionAmounts(loan)
    summary[key].received += amounts.received
    summary[key].paid += amounts.paid
    summary[key].interest += amounts.interest
    summary[key].balance += amounts.balanceEffect
    summary[key].transactions += 1
  })

  return Object.values(summary)
}
