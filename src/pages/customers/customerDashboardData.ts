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
    const storedDue = Number(sale.due_amount || 0)
    customerMap[sale.customer_id].totalPurchase += Number(sale.subtotal || 0) || netAmount + discount
    customerMap[sale.customer_id].totalDiscount += discount
    customerMap[sale.customer_id].collectionsAmount += paidAmount
    // Not clamped at zero, and not the largest of three. due_amount is the
    // server's own figure and it is kept in step with paid_amount on every
    // collection, so it is simply the answer; net - paid is the fallback for a
    // row old enough not to carry it.
    //
    // The clamp had to go with the double-subtraction below it. Between them,
    // a customer who overpaid could never read as being in credit: the clamp
    // threw the overpayment away per sale, and the only thing that could make
    // the total negative was the second subtraction, which was the bug.
    customerMap[sale.customer_id].invoiceDue += sale.due_amount == null ? netAmount - paidAmount : storedDue
  })

  // Recording a Due Received already increments the sale's paid_amount and
  // decrements its due (customerPayment.service.ts), so both figures above have
  // the collection in them. dueReceived is kept because the list shows it as a
  // column of its own, but it must not be added to collections or taken off the
  // due a second time - doing both is what made this page report Tk -14 lakh
  // owing against the Sales ledger's Tk 1.53 crore, the gap being exactly the
  // year's collections.
  payments.forEach((payment: any) => {
    if (!payment.customer_id || !customerMap[payment.customer_id]) return

    const dueDiscount = parseAmountText(parseMetaValue(payment.notes || '', 'Discount Amount'))
    customerMap[payment.customer_id].dueReceived += Number(payment.amount || 0)
    customerMap[payment.customer_id].extraDiscount += dueDiscount
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
    // invoiceDue is already net of every collection; only the discount written
    // off on a Due Received still has to come out, because that never reduced
    // the sale.
    currentDue: customer.openingDue + customer.invoiceDue - customer.extraDiscount,
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
    supabase.from('customer_payments').select('customer_id, amount, date, notes'),
  ])

  if (custRes.error) throw custRes.error
  if (salesRes.error) throw salesRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const customers = custRes.data || []
  const sales = salesRes.data || []
  const payments = paymentsRes.data || []
  return buildCustomerDashboard(customers, sales, payments)
}
