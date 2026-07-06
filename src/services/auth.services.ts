import { http } from '../lib/httpClient'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AuthAccount {
  user: { id: string; email: string }
  profile: any
  subscription: any
}

export const loginRequest = (email: string, password: string) =>
  http.post<AuthAccount>('/auth/login', { email, password })

export const registerOwnerRequest = (input: {
  fullName: string
  businessName: string
  phone: string
  email: string
  password: string
  address?: string
}) => http.post<AuthAccount>('/auth/register', input)

export const getMeRequest = () => http.get<AuthAccount>('/auth/me')

export const logoutRequest = () => http.post<{ loggedOut: boolean }>('/auth/logout')

export const touchActivityRequest = () => http.post<{ touched: boolean }>('/auth/touch-activity')
