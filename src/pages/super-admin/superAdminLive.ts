import { getOwners } from '../../services/admin.services'

export type OwnerPlan = 'Trial' | 'Starter' | 'Growth' | 'Enterprise'
export type OwnerStatus = 'pending' | 'trial' | 'active' | 'expired' | 'blocked' | 'suspended'
export type PlanType = 'free_trial' | 'monthly' | 'yearly'
export type PlanStatus = 'active' | 'expired' | 'suspended'

export interface OwnerSubscriptionRow {
  id: string
  owner_id: string
  business_name: string
  owner_email: string
  status: OwnerStatus
  plan: OwnerPlan
  trial_start: string
  trial_end: string
  active_until: string | null
  plan_type?: PlanType | null
  plan_status?: PlanStatus | null
  start_date?: string | null
  expiry_date?: string | null
  blocked_reason: string
  created_at: string
  updated_at: string
  last_active?: string | null
}

export interface OwnerProfileRow {
  id: string
  full_name: string
  phone: string
  role: string
  is_active: boolean
  created_at?: string
}

export interface LiveOwner {
  id: string
  owner_id: string
  name: string
  business: string
  email: string
  phone: string
  plan: OwnerPlan
  planType: PlanType
  status: OwnerStatus
  effectiveStatus: OwnerStatus
  trialStart: string
  trialEnd: string
  startDate: string | null
  expiryDate: string | null
  activeUntil: string | null
  blockedReason: string
  joinedAt: string
  lastActive: string | null
}

export interface OwnerLoadResult {
  owners: LiveOwner[]
  setupMissing: boolean
}

export function formatBDT(value: number) {
  return `৳${value.toLocaleString('en-BD')}`
}

export function formatDate(date?: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function planTypeLabel(planType?: PlanType | null) {
  if (planType === 'monthly') return 'Monthly'
  if (planType === 'yearly') return 'Yearly'
  return 'Free Trial'
}

export function daysLeft(date?: string | null) {
  if (!date) return 0
  const diff = new Date(date).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function registeredDays(date?: string | null) {
  if (!date) return 0
  const created = new Date(date).getTime()
  if (Number.isNaN(created)) return 0
  return Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)))
}

export function isOwnerOnline(lastActive?: string | null) {
  if (!lastActive) return false
  const timestamp = new Date(lastActive).getTime()
  if (Number.isNaN(timestamp)) return false
  return Date.now() - timestamp <= 5 * 60 * 1000
}

export function formatLastActive(lastActive?: string | null) {
  if (!lastActive) return 'Never'
  if (isOwnerOnline(lastActive)) return 'Active now'

  const timestamp = new Date(lastActive).getTime()
  if (Number.isNaN(timestamp)) return 'Never'

  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return `Left ${years} ${years === 1 ? 'year' : 'years'} ago`
  if (months > 0) return `Left ${months} ${months === 1 ? 'month' : 'months'} ago`
  if (days > 0) return `Left ${days} ${days === 1 ? 'day' : 'days'} ago`
  if (hours > 0) return `Left ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  if (minutes > 0) return `Left ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  return 'Active just now'
}

export function effectiveStatus(owner: Pick<OwnerSubscriptionRow, 'status' | 'trial_end' | 'active_until' | 'plan_status' | 'expiry_date'>): OwnerStatus {
  if (owner.plan_status === 'suspended') return 'suspended'
  if (owner.plan_status === 'expired') return 'expired'
  if (owner.plan_status === 'active') {
    if (owner.expiry_date && new Date(owner.expiry_date).getTime() < Date.now()) return 'expired'
    return 'active'
  }
  if (owner.status === 'pending') return 'pending'
  if (owner.status === 'blocked') return 'blocked'
  if (owner.status === 'active') {
    if (owner.active_until && new Date(owner.active_until).getTime() < Date.now()) return 'expired'
    return 'active'
  }
  if (owner.status === 'trial') return 'active'
  return owner.status
}

export function isOwnerSubscriptionTableMissing(error: any) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return code === 'PGRST205' || (
    message.includes('owner_subscriptions') &&
    (message.includes('Could not find the table') || message.includes('schema cache'))
  )
}

export async function loadOwners(): Promise<OwnerLoadResult> {
  // GET /super-admin/owners returns each owner user with their subscription.
  const rows: any[] = await getOwners()

  const owners = rows
    .filter((row) => row.subscription)
    .map((row) => {
      const subscription: OwnerSubscriptionRow = row.subscription

      return {
        id: subscription.id,
        owner_id: subscription.owner_id,
        name: row.full_name || '-',
        business: subscription.business_name || '-',
        email: subscription.owner_email || row.email || '-',
        phone: row.phone || '-',
        plan: subscription.plan,
        planType: subscription.plan_type || (subscription.plan === 'Trial' ? 'free_trial' : 'monthly'),
        status: subscription.status,
        effectiveStatus: effectiveStatus(subscription),
        trialStart: subscription.trial_start,
        trialEnd: subscription.trial_end,
        startDate: subscription.start_date || subscription.trial_start || subscription.created_at,
        expiryDate: subscription.expiry_date || subscription.active_until || subscription.trial_end,
        activeUntil: subscription.expiry_date || subscription.active_until,
        blockedReason: subscription.blocked_reason || '',
        joinedAt: subscription.created_at,
        lastActive: row.last_active || null,
      }
    })

  return { owners, setupMissing: false }
}
