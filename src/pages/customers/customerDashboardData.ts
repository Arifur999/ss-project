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
  currentDue: number
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
    customerMap[sale.customer_id].invoiceDue += Math.max(0, storedDue, netAmount - paidAmount)
  })

  payments.forEach((payment: any) => {
    if (!payment.customer_id || !customerMap[payment.customer_id]) return

    const dueDiscount = parseAmountText(parseMetaValue(payment.notes || '', 'Discount Amount'))
    customerMap[payment.customer_id].collectionsAmount += Number(payment.amount || 0)
    customerMap[payment.customer_id].dueReceived += Number(payment.amount || 0)
    customerMap[payment.customer_id].extraDiscount += dueDiscount
  })

  const customerList = Object.values(customerMap).map(customer => ({
    ...customer,
    currentDue: Math.max(0, customer.openingDue + customer.invoiceDue - customer.dueReceived - customer.extraDiscount),
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
      currentDue: customerList.reduce((sum, customer) => sum + customer.currentDue, 0),
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
