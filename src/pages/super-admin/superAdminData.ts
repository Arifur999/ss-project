export type OwnerStatus = 'active' | 'inactive' | 'blocked' | 'pending'

export interface OwnerAccount {
  id: string
  name: string
  business: string
  email: string
  phone: string
  plan: 'Starter' | 'Growth' | 'Enterprise'
  status: OwnerStatus
  revenue: number
  orders: number
  joinedAt: string
  purchaseDate?: string
  expireDate?: string
  softwareSize?: string
}

export const owners: OwnerAccount[] = [
  {
    id: 'OWN-1001',
    name: 'Rahim Uddin',
    business: 'Rahim Furniture',
    email: 'rahim@example.com',
    phone: '+8801711001001',
    plan: 'Enterprise',
    status: 'active',
    revenue: 1285000,
    orders: 428,
    joinedAt: '2026-01-12',
    purchaseDate: '2026-01-12',
    expireDate: '2027-01-11',
    softwareSize: 'Enterprise',
  },
  {
    id: 'OWN-1002',
    name: 'Nusrat Jahan',
    business: 'Nusrat Home Decor',
    email: 'nusrat@example.com',
    phone: '+8801711001002',
    plan: 'Growth',
    status: 'pending',
    revenue: 482000,
    orders: 136,
    joinedAt: '2026-03-04',
    purchaseDate: '2026-03-04',
    expireDate: '2026-07-04',
    softwareSize: 'Growth',
  },
  {
    id: 'OWN-1003',
    name: 'Karim Hasan',
    business: 'Hasan Furnishers',
    email: 'karim@example.com',
    phone: '+8801711001003',
    plan: 'Starter',
    status: 'inactive',
    revenue: 216000,
    orders: 74,
    joinedAt: '2025-11-20',
    purchaseDate: '2025-11-20',
    expireDate: '2026-06-20',
    softwareSize: 'Starter',
  },
  {
    id: 'OWN-1004',
    name: 'Mahi Akter',
    business: 'Mahi Design Studio',
    email: 'mahi@example.com',
    phone: '+8801711001004',
    plan: 'Growth',
    status: 'active',
    revenue: 738000,
    orders: 219,
    joinedAt: '2026-02-18',
    purchaseDate: '2026-02-18',
    expireDate: '2026-12-18',
    softwareSize: 'Growth',
  },
  {
    id: 'OWN-1005',
    name: 'Tanvir Ahmed',
    business: 'Tanvir Wood Works',
    email: 'tanvir@example.com',
    phone: '+8801711001005',
    plan: 'Starter',
    status: 'blocked',
    revenue: 95000,
    orders: 31,
    joinedAt: '2025-12-08',
    purchaseDate: '2025-12-08',
    expireDate: '2026-06-08',
    softwareSize: 'Starter',
  },
]

export const payments = [
  { id: 'PAY-7891', invoice: 'INV-2026-089', owner: 'Rahim Furniture', email: 'rahim@example.com', method: 'Card', amount: 48000, status: 'paid', date: '2026-06-08', transactionId: 'TXN-442981' },
  { id: 'PAY-7890', invoice: 'INV-2026-088', owner: 'Mahi Design Studio', email: 'mahi@example.com', method: 'bKash', amount: 18000, status: 'paid', date: '2026-06-07', transactionId: 'TXN-442718' },
  { id: 'PAY-7889', invoice: 'INV-2026-087', owner: 'Nusrat Home Decor', email: 'nusrat@example.com', method: 'Bank', amount: 26000, status: 'pending', date: '2026-06-06', transactionId: 'TXN-442512' },
  { id: 'PAY-7888', invoice: 'INV-2026-086', owner: 'Hasan Furnishers', email: 'karim@example.com', method: 'Card', amount: 9500, status: 'failed', date: '2026-06-05', transactionId: 'TXN-442402' },
  { id: 'PAY-7887', invoice: 'INV-2026-085', owner: 'Tanvir Wood Works', email: 'tanvir@example.com', method: 'Cash', amount: 6500, status: 'refunded', date: '2026-06-03', transactionId: 'TXN-441998' },
]

export const monthlyRevenue = [
  { month: 'Jan', revenue: 420000, sales: 1800000, owners: 22 },
  { month: 'Feb', revenue: 468000, sales: 2060000, owners: 25 },
  { month: 'Mar', revenue: 516000, sales: 2390000, owners: 29 },
  { month: 'Apr', revenue: 548000, sales: 2610000, owners: 32 },
  { month: 'May', revenue: 612000, sales: 2880000, owners: 37 },
  { month: 'Jun', revenue: 685000, sales: 3210000, owners: 41 },
]

export const last30Days = [
  { day: '1', sellers: 6, payments: 4 },
  { day: '5', sellers: 8, payments: 6 },
  { day: '10', sellers: 11, payments: 9 },
  { day: '15', sellers: 15, payments: 11 },
  { day: '20', sellers: 18, payments: 13 },
  { day: '25', sellers: 21, payments: 16 },
  { day: '30', sellers: 24, payments: 19 },
]

export const activities = [
  { title: 'New owner request approved', detail: 'Nusrat Home Decor moved to pending verification', time: '10 min ago', type: 'owner' },
  { title: 'Payment received', detail: 'Rahim Furniture paid ৳48,000 subscription invoice', time: '1 hour ago', type: 'payment' },
  { title: 'Role policy updated', detail: 'Owner role permission changed for reports module', time: '3 hours ago', type: 'settings' },
  { title: 'Service package changed', detail: 'Mahi Design Studio upgraded to Growth plan', time: 'Yesterday', type: 'service' },
  { title: 'Account blocked', detail: 'Tanvir Wood Works blocked after failed verification', time: 'Yesterday', type: 'security' },
]

export function formatBDT(value: number) {
  return `৳${value.toLocaleString('en-BD')}`
}

export function getSummary() {
  const totalRevenue = owners.reduce((sum, owner) => sum + owner.revenue, 0)
  const totalOrders = owners.reduce((sum, owner) => sum + owner.orders, 0)
  const activeOwners = owners.filter(owner => owner.status === 'active').length
  const inactiveOwners = owners.filter(owner => owner.status === 'inactive' || owner.status === 'blocked').length
  const pendingRequests = owners.filter(owner => owner.status === 'pending').length
  const paidPayments = payments.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0)

  return {
    totalUsers: owners.length,
    totalOrders,
    totalRevenue,
    totalSales: totalRevenue,
    activeOwners,
    inactiveOwners,
    pendingRequests,
    paidPayments,
  }
}
