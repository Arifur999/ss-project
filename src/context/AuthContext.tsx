import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  getMeRequest,
  loginRequest,
  logoutRequest,
  registerOwnerRequest,
  resendOtpRequest,
  touchActivityRequest,
  verifyOtpRequest,
} from '../services/auth.services'

export type UserRole = 'super_admin' | 'owner' | 'manager' | 'sales_staff' | 'accountant'
export type SubscriptionStatus = 'pending' | 'trial' | 'active' | 'expired' | 'blocked' | 'suspended'
export type PlanType = 'free_trial' | 'monthly' | 'yearly'
export type PlanStatus = 'active' | 'expired' | 'suspended'
export type EffectiveSubscriptionStatus = SubscriptionStatus | 'none'

// Minimal user shape (replaces the old supabase User object).
export interface AuthUser {
  id: string
  email: string
  user_metadata?: Record<string, string>
}

interface Profile {
  id: string
  owner_id?: string | null
  full_name: string
  email?: string
  role: UserRole
  phone: string
  branch_id: string | null
  is_active: boolean
}

interface OwnerSubscription {
  id: string
  owner_id: string
  business_name: string
  owner_email: string
  status: SubscriptionStatus
  plan: string
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
}

interface RegisterOwnerInput {
  fullName: string
  businessName: string
  phone: string
  email: string
  password: string
  address?: string
}

interface AuthContextType {
  user: AuthUser | null
  session: null
  profile: Profile | null
  subscription: OwnerSubscription | null
  subscriptionStatus: EffectiveSubscriptionStatus
  subscriptionLocked: boolean
  displayName: string
  loading: boolean
  // signIn can end in three ways: error, logged-in, or "verify your email
  // first" (needsEmailConfirmation) when the account never confirmed its OTP.
  signIn: (email: string, password: string) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean; email?: string }>
  signOut: () => Promise<void>
  // Registration always requires OTP verification before the user is let in.
  registerOwner: (input: RegisterOwnerInput) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean; email?: string }>
  // Submit the emailed 6-digit code - on success the user is logged in.
  verifyOtp: (email: string, otp: string) => Promise<{ error: Error | null }>
  // Ask the server to email a fresh code (60s cooldown server-side).
  resendOtp: (email: string) => Promise<{ error: Error | null }>
  refreshAccount: () => Promise<void>
  touchOwnerActivity: (force?: boolean) => Promise<void>
  canAccess: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export const SUBSCRIPTION_EXPIRED_LOGIN_MESSAGE = 'Your subscription has expired! Please purchase a dynamic renewal plan or request an administrator to grant a free trial extension to regain system access.'

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  owner: ['*'],
  manager: ['sales', 'purchase', 'reports', 'customers', 'inventory', 'suppliers', 'expenses'],
  sales_staff: ['sales', 'customers', 'inventory_view'],
  accountant: ['reports', 'expenses', 'customers_view', 'balance_view'],
}

function effectiveSubscriptionStatus(subscription: OwnerSubscription | null): EffectiveSubscriptionStatus {
  if (!subscription) return 'none'
  if (subscription.plan_status === 'suspended') return 'suspended'
  if (subscription.plan_status === 'expired') return 'expired'
  if (subscription.plan_status === 'active' && subscription.expiry_date && new Date(subscription.expiry_date).getTime() <= Date.now()) return 'expired'
  if (subscription.plan_status === 'active') return 'active'
  if (subscription.status === 'pending') return 'pending'
  if (subscription.status === 'blocked') return 'blocked'
  if (subscription.status === 'active') return 'active'
  if (subscription.status === 'trial') return 'active'
  return subscription.status
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<OwnerSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const lastActivityTouch = useRef(0)
  const profileRef = useRef<Profile | null>(null)
  profileRef.current = profile

  useEffect(() => {
    loadAccount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // An owner's subscription can expire while the app is open - re-check near expiry.
  useEffect(() => {
    if (profile?.role !== 'owner' || !subscription || subscription.plan_status !== 'active') return

    const expiryTime = subscription.expiry_date ? new Date(subscription.expiry_date).getTime() : 0
    const delay = expiryTime ? Math.max(0, expiryTime - Date.now() + 1000) : 60 * 1000
    const timeout = window.setTimeout(() => {
      loadAccount()
    }, Math.min(delay, 60 * 1000))

    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, subscription?.id, subscription?.plan_status, subscription?.expiry_date])

  async function loadAccount() {
    try {
      const account = await getMeRequest()
      setUser(account.user)
      setProfile(account.profile)
      setSubscription(account.subscription)
    } catch {
      setUser(null)
      setProfile(null)
      setSubscription(null)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const result = await loginRequest(email, password)

      // Password was right but the email was never verified: the backend has
      // already emailed a fresh OTP - hand control to the verification screen.
      if ('needsEmailConfirmation' in result) {
        return { error: null, needsEmailConfirmation: true, email: result.email }
      }

      // Fully verified account: cookies are set, hydrate the auth state.
      setUser(result.user)
      setProfile(result.profile)
      setSubscription(result.subscription)
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Login failed') }
    }
  }

  async function registerOwner(input: RegisterOwnerInput) {
    if (!input.businessName?.trim() || !input.phone?.trim()) {
      return { error: new Error('This field is required!') }
    }

    try {
      const result = await registerOwnerRequest(input)

      // Registration ALWAYS ends at the OTP screen now - the account exists
      // but stays locked until the emailed code is confirmed.
      if ('needsEmailConfirmation' in result) {
        return { error: null, needsEmailConfirmation: true, email: result.email }
      }

      // Defensive fallback (should not happen with the current backend).
      setUser(result.user)
      setProfile(result.profile)
      setSubscription(result.subscription)
      return { error: null, needsEmailConfirmation: false }
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Registration failed') }
    }
  }

  // Submit the 6-digit emailed code. On success the backend marks the email
  // verified AND sets the auth cookies - so this doubles as the login step.
  async function verifyOtp(email: string, otp: string) {
    try {
      const account = await verifyOtpRequest(email, otp)
      setUser(account.user)
      setProfile(account.profile)
      setSubscription(account.subscription)
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Verification failed') }
    }
  }

  // Request a fresh code. The server enforces a 60-second cooldown and will
  // answer with a descriptive error if pressed too soon.
  async function resendOtp(email: string) {
    try {
      await resendOtpRequest(email)
      return { error: null }
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Could not resend code') }
    }
  }

  async function signOut() {
    setUser(null)
    setProfile(null)
    setSubscription(null)
    try {
      await logoutRequest()
    } catch {
      // Ignore network errors during logout - local state is already cleared.
    }
  }

  async function refreshAccount() {
    await loadAccount()
    await touchOwnerActivity(false)
  }

  const touchOwnerActivity = useCallback(async (force = false) => {
    if (profileRef.current?.role !== 'owner') return

    const now = Date.now()
    if (!force && now - lastActivityTouch.current < 60 * 1000) return
    lastActivityTouch.current = now

    try {
      await touchActivityRequest()
    } catch {
      // Activity tracking must never break the app.
    }
  }, [])

  function canAccess(permission: string): boolean {
    if (!profile) return false
    const perms = ROLE_PERMISSIONS[profile.role] || []
    if (perms.includes('*')) return true
    return perms.includes(permission)
  }

  const subscriptionStatus = effectiveSubscriptionStatus(subscription)
  const subscriptionLocked = profile?.role === 'owner' && (
    subscriptionStatus === 'pending' ||
    subscriptionStatus === 'blocked' ||
    subscriptionStatus === 'suspended' ||
    subscriptionStatus === 'expired' ||
    subscriptionStatus === 'none'
  )
  const displayName = profile?.role === 'owner'
    ? subscription?.business_name || profile?.full_name || user?.email || 'Owner'
    : profile?.full_name || user?.email || 'Owner'

  return (
    <AuthContext.Provider value={{
      user,
      session: null,
      profile,
      subscription,
      subscriptionStatus,
      subscriptionLocked,
      displayName,
      loading,
      signIn,
      signOut,
      registerOwner,
      verifyOtp,
      resendOtp,
      refreshAccount,
      touchOwnerActivity,
      canAccess,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
