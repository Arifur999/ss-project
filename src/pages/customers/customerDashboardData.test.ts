import { describe, expect, it } from 'vitest'
import { buildCustomerDashboard, customerCurrentDue, saleDue } from './customerDashboardData'

/**
 * A Due Received does NOT touch the sale it helps pay off.
 *
 * customerPayment.service.ts settles a sale only when the payment carries a
 * sale_id, and CustomerDueReceived - the app's only writer of customer_payments
 * - never sets one, because a collection is taken against the customer's whole
 * balance rather than one invoice. So the sale rows keep showing the full due
 * and the collection has to be taken off here.
 *
 * Every fixture below is written the way the API really returns it: paid_amount
 * holds what was handed over AT THE TILL and nothing else.
 */

const customer = { id: 'c1', name: 'Rahim', phone: '01711', address: 'Dhaka', opening_due: 0 }

/** A Tk 100,000 sale with `paidAtTill` taken at the counter. */
const sale = (paidAtTill: number) => ({
  customer_id: 'c1', customer_name: 'Rahim',
  subtotal: 100000, net_amount: 100000, discount_amount: 0,
  paid_amount: paidAtTill, due_amount: 100000 - paidAtTill, date: '2026-08-01',
})

/** A collection recorded on the Due Received page - no sale_id, as in production. */
const collection = (amount: number, notes = '') => ({
  customer_id: 'c1', amount, date: '2026-08-10', notes,
})

describe('what a customer still owes', () => {
  it('is the sale, less what was paid at the till', () => {
    const { stats } = buildCustomerDashboard([customer], [sale(40000)], [])
    expect(stats.currentDue).toBe(60000)
  })

  it('takes a Due Received off the balance', () => {
    // 40,000 at the till, then 25,000 collected later. The sale row is
    // untouched by that second payment, so 100,000 - 40,000 - 25,000 = 35,000.
    const { stats } = buildCustomerDashboard([customer], [sale(40000)], [collection(25000)])
    expect(stats.currentDue).toBe(35000)
  })

  it('settles an account paid off entirely through Due Received', () => {
    // The case the page got wrong: nothing paid at the till, the whole invoice
    // collected afterwards. The sale still reads paid 0 / due 100,000.
    const { stats } = buildCustomerDashboard([customer], [sale(0)], [collection(100000)])
    expect(stats.currentDue).toBe(0)
    expect(stats.outstandingDue).toBe(0)
  })

  it('clears an opening due that was paid off, with no sale in sight', () => {
    // An opening balance has no invoice to attach a payment to, so this case
    // can only ever be answered here.
    const { stats } = buildCustomerDashboard(
      [{ ...customer, opening_due: 50000 }],
      [],
      [collection(50000)],
    )
    expect(stats.currentDue).toBe(0)
  })

  it('carries an opening due through alongside a sale', () => {
    const { stats } = buildCustomerDashboard([{ ...customer, opening_due: 12000 }], [sale(40000)], [])
    expect(stats.currentDue).toBe(72000)
  })

  it('does not take a collection off twice when it was linked to a sale', () => {
    // A payment carrying a sale_id HAS already been taken off its sale by the
    // server, so it must not come off again here.
    const settled = { ...sale(0), paid_amount: 100000, due_amount: 0 }
    const { stats } = buildCustomerDashboard(
      [customer],
      [settled],
      [{ ...collection(100000), sale_id: 's1' }],
    )
    expect(stats.currentDue).toBe(0)
  })

  it('still takes off a discount written off on a Due Received', () => {
    // The discount never reduced the sale either, so it comes off here too.
    const { stats } = buildCustomerDashboard(
      [customer],
      [sale(40000)],
      [collection(25000, 'Discount Amount: 5000')],
    )
    expect(stats.extraDiscount).toBe(5000)
    expect(stats.currentDue).toBe(30000)
  })

  it('reports an overpayment as credit', () => {
    const { stats } = buildCustomerDashboard([customer], [sale(40000)], [collection(75000)])
    expect(stats.currentDue).toBe(-15000)
    expect(stats.customerCredit).toBe(15000)
    expect(stats.outstandingDue).toBe(0)
  })

  it('reports an overpayment taken at the till as credit too', () => {
    const { stats } = buildCustomerDashboard([customer], [sale(120000)], [])
    expect(stats.currentDue).toBe(-20000)
    expect(stats.customerCredit).toBe(20000)
  })

  it('keeps the two sides separate across customers', () => {
    const other = { id: 'c2', name: 'Karim', phone: '01811', address: 'Khulna', opening_due: 0 }
    const { stats } = buildCustomerDashboard(
      [customer, other],
      [sale(40000), { ...sale(120000), customer_id: 'c2', customer_name: 'Karim' }],
      [],
    )
    expect(stats.currentDue).toBe(40000)      // 60,000 owed less 20,000 in credit
    expect(stats.outstandingDue).toBe(60000)
    expect(stats.customerCredit).toBe(20000)
  })

  it('counts a sale whose due_amount was never written', () => {
    // due_amount is NOT NULL defaulting to 0 and the sale API never computes
    // it, so a row saved without one reads 0. The figure has to be derived.
    const noStoredDue = { ...sale(0), due_amount: 0 }
    const { stats } = buildCustomerDashboard([customer], [noStoredDue], [])
    expect(stats.currentDue).toBe(100000)
  })

  it('ignores a payment belonging to nobody on the list', () => {
    const { stats } = buildCustomerDashboard(
      [customer],
      [sale(40000)],
      [{ customer_id: 'gone', amount: 9999, date: '2026-08-10', notes: '' }],
    )
    expect(stats.currentDue).toBe(60000)
  })
})

describe('what has been collected', () => {
  it('counts money taken at the till and money collected afterwards', () => {
    const { stats } = buildCustomerDashboard([customer], [sale(40000)], [collection(25000)])
    expect(stats.collectionsAmount).toBe(65000)
  })

  it('counts a collection that never reached the till at all', () => {
    // The contradiction this fixes: Collections read Tk 0 on a row whose Due
    // Received column beside it read Tk 100,000.
    const { stats, customerList } = buildCustomerDashboard([customer], [sale(0)], [collection(100000)])
    expect(stats.collectionsAmount).toBe(100000)
    expect(customerList[0].dueReceived).toBe(100000)
  })

  it('does not count a sale-linked payment twice', () => {
    // It is already inside that sale's paid_amount.
    const settled = { ...sale(0), paid_amount: 100000, due_amount: 0 }
    const { stats } = buildCustomerDashboard(
      [customer],
      [settled],
      [{ ...collection(100000), sale_id: 's1' }],
    )
    expect(stats.collectionsAmount).toBe(100000)
  })
})

describe('customerCurrentDue', () => {
  // The Due Received modal's "Previous Due" reads this. Anything it answers
  // differently from the dashboard is a number the owner sees twice and is told
  // twice about.
  const agrees = (openingDue: number, sales: any[], payments: any[]) => {
    const single = customerCurrentDue(openingDue, sales, payments)
    const { stats } = buildCustomerDashboard([{ ...customer, opening_due: openingDue }], sales, payments)
    expect(single).toBe(stats.currentDue)
    return single
  }

  it('is the opening balance when there is nothing else', () => {
    expect(agrees(5000, [], [])).toBe(5000)
  })

  it('clears an opening balance that was paid off', () => {
    // The case on screen: opening Tk 5,000, one Due Received of Tk 5,000. The
    // Customer List still shows Tk 5,000 because that column is the opening
    // figure, which never moves - this is the balance, and it is nil.
    expect(agrees(5000, [], [collection(5000)])).toBe(0)
  })

  it('takes off a discount written off on a Due Received', () => {
    // The modal used to miss this: Tk 4,000 collected against Tk 5,000 with the
    // last Tk 1,000 written off still showed Tk 1,000 owing there while the
    // dashboard showed the account clear.
    expect(agrees(5000, [], [collection(4000, 'Discount Amount: 1000')])).toBe(0)
  })

  it('does not take off a payment its own sale has already absorbed', () => {
    const settled = { ...sale(0), paid_amount: 100000, due_amount: 0 }
    expect(agrees(0, [settled], [{ ...collection(100000), sale_id: 's1' }])).toBe(0)
  })

  it('adds the unpaid part of every invoice', () => {
    expect(agrees(5000, [sale(40000)], [])).toBe(65000)
  })

  it('reports a credit rather than clamping it away', () => {
    expect(agrees(0, [sale(40000)], [collection(75000)])).toBe(-15000)
  })

  it('reads a missing opening balance as nil', () => {
    expect(customerCurrentDue(null, [], [])).toBe(0)
    expect(customerCurrentDue(undefined, [], [])).toBe(0)
    expect(customerCurrentDue('', [], [])).toBe(0)
  })
})

describe('saleDue', () => {
  // Sales, the Customer Dashboard and the Due Received page all read this, so
  // one sale cannot owe three different amounts.
  it('is what is left on the sale', () => {
    expect(saleDue({ net_amount: 100000, paid_amount: 40000 })).toBe(60000)
  })

  it('reports an over-settled sale as credit rather than nil', () => {
    // The Sales page clamped this at zero, so a customer who paid Tk 120,000
    // against Tk 100,000 read as owing nothing there and as Tk 20,000 in credit
    // on the dashboard.
    expect(saleDue({ net_amount: 100000, paid_amount: 120000 })).toBe(-20000)
  })

  it('ignores due_amount, however wrong it is', () => {
    // NOT NULL defaulting to 0 and never computed by the sale API: a row saved
    // without one says 0 while the whole amount is outstanding, and a stale one
    // says more is owed than really is.
    expect(saleDue({ net_amount: 100000, paid_amount: 0, due_amount: 0 } as any)).toBe(100000)
    expect(saleDue({ net_amount: 100000, paid_amount: 100000, due_amount: 999999 } as any)).toBe(0)
  })

  it('reads a missing figure as nil', () => {
    expect(saleDue({})).toBe(0)
    expect(saleDue({ net_amount: null, paid_amount: undefined })).toBe(0)
  })
})
