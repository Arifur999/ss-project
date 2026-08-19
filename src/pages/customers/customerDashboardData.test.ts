import { describe, expect, it } from 'vitest'
import { buildCustomerDashboard } from './customerDashboardData'

/**
 * Recording a Due Received already increments the sale's paid_amount and
 * decrements its due, server-side. Every case below turns on that: the page
 * must not take the same collection off a second time.
 */

const customer = { id: 'c1', name: 'Rahim', phone: '01711', address: 'Dhaka', opening_due: 0 }

// A sale of 100,000 with 40,000 paid at the till: the row the API returns
// afterwards, with the collection already folded in.
const saleAfterCollection = (paid: number) => ({
  customer_id: 'c1', customer_name: 'Rahim',
  subtotal: 100000, net_amount: 100000, discount_amount: 0,
  paid_amount: paid, due_amount: 100000 - paid, date: '2026-08-01',
})

describe('what a customer still owes', () => {
  it('is the sale, less what has been paid on it', () => {
    const { stats } = buildCustomerDashboard([customer], [saleAfterCollection(40000)], [])
    expect(stats.currentDue).toBe(60000)
  })

  it('does not take a collection off twice', () => {
    // 40,000 at the till, then 25,000 received against the due. The server has
    // already moved the sale to paid 65,000 / due 35,000, and the payment row
    // still exists. The answer is 35,000, not 10,000.
    const { stats } = buildCustomerDashboard(
      [customer],
      [saleAfterCollection(65000)],
      [{ customer_id: 'c1', amount: 25000, date: '2026-08-10', notes: '' }],
    )
    expect(stats.currentDue).toBe(35000)
  })

  it('never goes negative just because money was collected', () => {
    // The bug this replaced: a fully settled sale with a payment row against it
    // came out as the business owing the customer.
    const { stats } = buildCustomerDashboard(
      [customer],
      [saleAfterCollection(100000)],
      [{ customer_id: 'c1', amount: 60000, date: '2026-08-10', notes: '' }],
    )
    expect(stats.currentDue).toBe(0)
  })

  it('counts collections once, not twice', () => {
    const { stats } = buildCustomerDashboard(
      [customer],
      [saleAfterCollection(65000)],
      [{ customer_id: 'c1', amount: 25000, date: '2026-08-10', notes: '' }],
    )
    expect(stats.collectionsAmount).toBe(65000)
  })

  it('still takes off a discount written off on a Due Received', () => {
    // That discount never reduced the sale, so it is the one thing on a payment
    // row that does still have to come out here.
    const { stats } = buildCustomerDashboard(
      [customer],
      [saleAfterCollection(65000)],
      [{ customer_id: 'c1', amount: 25000, date: '2026-08-10', notes: 'Discount Amount: 5000' }],
    )
    expect(stats.extraDiscount).toBe(5000)
    expect(stats.currentDue).toBe(30000)
  })

  it('carries an opening due through', () => {
    const { stats } = buildCustomerDashboard(
      [{ ...customer, opening_due: 12000 }],
      [saleAfterCollection(40000)],
      [],
    )
    expect(stats.currentDue).toBe(72000)
  })

  it('still reports a genuine overpayment as credit', () => {
    // Not the same thing as the bug: here the sale itself is over-settled, so
    // the business really does owe the customer.
    const { stats } = buildCustomerDashboard([customer], [saleAfterCollection(120000)], [])
    expect(stats.currentDue).toBe(-20000)
    expect(stats.customerCredit).toBe(20000)
    expect(stats.outstandingDue).toBe(0)
  })

  it('keeps the two sides separate across customers', () => {
    const other = { id: 'c2', name: 'Karim', phone: '01811', address: 'Khulna', opening_due: 0 }
    const { stats } = buildCustomerDashboard(
      [customer, other],
      [saleAfterCollection(40000), { ...saleAfterCollection(120000), customer_id: 'c2', customer_name: 'Karim' }],
      [],
    )
    expect(stats.currentDue).toBe(40000)      // 60,000 owed less 20,000 in credit
    expect(stats.outstandingDue).toBe(60000)
    expect(stats.customerCredit).toBe(20000)
  })

  it('ignores a payment belonging to nobody on the list', () => {
    const { stats } = buildCustomerDashboard(
      [customer],
      [saleAfterCollection(40000)],
      [{ customer_id: 'gone', amount: 9999, date: '2026-08-10', notes: '' }],
    )
    expect(stats.currentDue).toBe(60000)
  })
})
