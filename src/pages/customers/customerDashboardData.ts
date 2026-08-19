import { supabase } from '../../lib/supabase'

export type CustomerDashboardRow = {
  id: string
  name: string
  phone?: string
  address?: string
  opening_due?: number
  openingDue: number
  totalPurchase: number
  totalDiscount: number
  collectionsAmount: number
  invoiceDue: number
  dueReceived: number
  extraDiscount: number
  currentDue: number
}

export type CustomerDashboardStats = {
  totalCustomers: number
  openingDue: number
  totalPurchase: number
  totalDiscount: number
  collectionsAmount: number
  extraDiscount: number
  /** The net position across every customer: what is owed less what is in credit. */
  currentDue: number
  /** Only the customers who owe us - the figure to chase collections against. */
  outstandingDue: number
  /** Only the customers we owe, i.e. overpayments sitting on account. */
  customerCredit: number
}

export type CustomerDashboardDataset = {
  stats: CustomerDashboardStats
  customerList: CustomerDashboardRow[]
}

export function parseMetaValue(notes: string, label: string) {
  const line = String(notes || '').split('\n').find(item => item.toLowerCase().startsWith(`${label.toLowerCase()}:`))
  return line ? line.slice(label.length + 1).trim() : ''
}

export function parseAmountText(value: string) {
  return Number(String(value || '').replace(/[^\d.-]/g, '')) || 0
}

/**
 * The dashboard's figures, from the three lists it reads.
 *
 * Split out of the loader so the arithmetic can be tested without a database -
 * this is where a customer's due is decided, and it was wrong for a year.
 */
export function buildCustomerDashboard(
  customers: any[],
  sales: any[],
  payments: any[],
): CustomerDashboardDataset {
  const customerMap: Record<string, CustomerDashboardRow> = {}
  customers.forEach((customer: any) => {
    customerMap[customer.id] = {
      ...customer,
      openingDue: Number(customer.opening_due || 0),
      totalPurchase: 0,
      totalDiscount: 0,
      collectionsAmount: 0,
      invoiceDue: 0,
      dueReceived: 0,
      extraDiscount: 0,
      currentDue: 0,
    }
  })

  sales.forEach((sale: any) => {
    if (!sale.customer_id || !customerMap[sale.customer_id]) return

    const discount = Number(sale.discount_amount || 0)
    const netAmount = Number(sale.net_amount || 0)
    const paidAmount = Number(sale.paid_amount || 0)
    customerMap[sale.customer_id].totalPurchase += Number(sale.subtotal || 0) || netAmount + discount
    customerMap[sale.customer_id].totalDiscount += discount
    customerMap[sale.customer_id].collectionsAmount += paidAmount
    // Derived, not read from due_amount. That column is nullable in no sense -
    // it is NOT NULL defaulting to 0 (prisma/schema/sales.prisma) and the sale
    // API takes it as an optional field it never computes, so a row saved
    // without one stores 0 and would have contributed nothing at all. net minus
    // paid is always derivable and cannot go stale.
    //
    // Not clamped at zero: a sale that was over-settled at the till is money we
    // owe the customer, and the total below is meant to be able to say so.
    customerMap[sale.customer_id].invoiceDue += netAmount - paidAmount
  })

  // Collections that no sale knows about, per customer.
  //
  // customerPayment.service.ts moves a sale's paid_amount and due_amount only
  // when the payment carries a sale_id, and nothing in this app ever sets one -
  // Due Received is collected against the customer's whole balance, not against
  // one invoice, and an opening due has no invoice to attach to at all. So for
  // every payment this app writes, the sale rows still show the full amount and
  // the collection has to come off here.
  //
  // A payment that DOES carry a sale_id (older data, or a future screen that
  // settles one invoice) is left out: that one already reduced its sale, and
  // subtracting it again is what would double-count it.
  const unlinkedReceived: Record<string, number> = {}

  payments.forEach((payment: any) => {
    if (!payment.customer_id || !customerMap[payment.customer_id]) return

    const dueDiscount = parseAmountText(parseMetaValue(payment.notes || '', 'Discount Amount'))
    const amount = Number(payment.amount || 0)
    customerMap[payment.customer_id].dueReceived += amount
    customerMap[payment.customer_id].extraDiscount += dueDiscount

    if (!payment.sale_id) {
      unlinkedReceived[payment.customer_id] = (unlinkedReceived[payment.customer_id] || 0) + amount
      // Money that reached an account is a collection wherever it was recorded.
      // Counting only paid_amount left the Collections column reading Tk 0 for a
      // customer who had paid in full through Due Received.
      customerMap[payment.customer_id].collectionsAmount += amount
    }
  })

  // Not clamped at zero. It used to be Math.max(0, ...), which hid every credit
  // balance: a customer who had overpaid read as owing nothing instead of being
  // in credit, and because the headline below sums these values, the total
  // "Current Due" was overstated by the sum of every customer's credit.
  //
  // A negative here is money we owe the customer, and formatCurr/amountClass
  // already render a negative in red site-wide, so it reads correctly on screen.
  const customerList = Object.values(customerMap).map(customer => ({
    ...customer,
    // What they were billed, less what they have actually handed over: the
    // opening balance plus the unpaid part of every invoice, less the
    // collections no invoice absorbed, less anything written off on one.
    currentDue:
      customer.openingDue
      + customer.invoiceDue
      - (unlinkedReceived[customer.id] || 0)
      - customer.extraDiscount,
  })).sort((a, b) => b.currentDue - a.currentDue)

  return {
    customerList,
    stats: {
      totalCustomers: customers.length,
      openingDue: customerList.reduce((sum, customer) => sum + customer.openingDue, 0),
      totalPurchase: customerList.reduce((sum, customer) => sum + customer.totalPurchase, 0),
      totalDiscount: customerList.reduce((sum, customer) => sum + customer.totalDiscount, 0),
      collectionsAmount: customerList.reduce((sum, customer) => sum + customer.collectionsAmount, 0),
      extraDiscount: customerList.reduce((sum, customer) => sum + customer.extraDiscount, 0),
      // The net position across all customers, which is what the two figures
      // beside it (what was billed, what was collected) actually add up to.
      currentDue: customerList.reduce((sum, customer) => sum + customer.currentDue, 0),
      /** Only the customers who owe us, for chasing collections. */
      outstandingDue: customerList.reduce((sum, customer) => sum + Math.max(0, customer.currentDue), 0),
      /** Only the customers we owe, i.e. overpayments sitting on account. */
      customerCredit: customerList.reduce((sum, customer) => sum + Math.max(0, -customer.currentDue), 0),
    },
  }
}

export function subscribeCustomerDashboardDataset(onChange: () => void) {
  const channel = supabase
    .channel(`customer-dashboard-dataset-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_payments' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export async function loadCustomerDashboardDataset(): Promise<CustomerDashboardDataset> {
  const [custRes, salesRes, paymentsRes] = await Promise.all([
    supabase.from('customers').select('id, name, phone, address, opening_due').order('name'),
    supabase.from('sales').select('customer_id, customer_name, subtotal, net_amount, discount_amount, paid_amount, due_amount, date').eq('status', 'completed'),
    supabase.from('customer_payments').select('customer_id, sale_id, amount, date, notes'),
  ])

  if (custRes.error) throw custRes.error
  if (salesRes.error) throw salesRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const customers = custRes.data || []
  const sales = salesRes.data || []
  const payments = paymentsRes.data || []
  return buildCustomerDashboard(customers, sales, payments)
}
