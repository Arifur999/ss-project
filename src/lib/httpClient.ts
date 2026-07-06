import axios, { AxiosError, AxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'

export interface ApiEnvelope<T> {
  success: boolean
  data: T
  message: string
  meta?: { page: number; limit: number; total: number; totalPage: number }
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// On 401, try one silent refresh then retry the original request once.
let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh-token`, {}, { withCredentials: true })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => { refreshPromise = null }, 0)
      })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined
    const url = String(original?.url || '')
    const isAuthPath = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh-token')

    if (error.response?.status === 401 && original && !original._retried && !isAuthPath) {
      original._retried = true
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        return api.request(original)
      }
    }

    return Promise.reject(error)
  }
)

// Normalizes any thrown error to a readable message (backend envelope aware).
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
    if (error.message) return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

// Unwraps the backend envelope; throws an Error with the server message on failure.
async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  try {
    const response = await promise
    return response.data.data
  } catch (error) {
    throw new Error(apiErrorMessage(error))
  }
}

export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig) => unwrap<T>(api.get(url, config)),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(api.post(url, body, config)),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(api.put(url, body, config)),
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(api.patch(url, body, config)),
  delete: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(api.delete(url, { ...config, data: body })),
}
