import { http } from '../lib/httpClient'


export interface AuthAccount {
  user: { id: string; email: string }
  profile: any
  subscription: any
}

// Login/register can answer in two shapes:
//  - a full AuthAccount when the user is verified and logged in, or
//  - { needsEmailConfirmation: true, email } when an OTP was emailed and the
//    frontend must show the verification screen first.
export interface NeedsEmailConfirmation {
  needsEmailConfirmation: true
  email: string
}

export type AuthResult = AuthAccount | NeedsEmailConfirmation

export const loginRequest = (email: string, password: string) =>
  http.post<AuthResult>('/auth/login', { email, password })

export const registerOwnerRequest = (input: {
  fullName: string
  businessName: string
  phone: string
  email: string
  password: string
  address?: string
}) => http.post<AuthResult>('/auth/register', input)

// Step 2: submit the 6-digit emailed code -> verified + logged in (cookies set).
export const verifyOtpRequest = (email: string, otp: string) =>
  http.post<AuthAccount>('/auth/verify-otp', { email, otp })

// "Didn't get the code?" - server enforces a 60s cooldown between sends.
export const resendOtpRequest = (email: string) =>
  http.post<{ sent: boolean; email: string }>('/auth/resend-otp', { email })

export const getMeRequest = () => http.get<AuthAccount>('/auth/me')

export const logoutRequest = () => http.post<{ loggedOut: boolean }>('/auth/logout')

export const touchActivityRequest = () => http.post<{ touched: boolean }>('/auth/touch-activity')
