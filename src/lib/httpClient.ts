import axios, { AxiosError, AxiosRequestConfig } from 'axios'

// A production build talks to the API on its OWN origin: nginx serves this SPA
// and proxies /api/ to the backend container. Same origin means no CORS
// preflight on any request, and no hostname baked into the bundle - the same
// build works on any domain the server answers to. `npm run dev` has no such
// proxy, so it falls back to the local API. VITE_API_BASE_URL still wins if
// the API ever needs to live somewhere else.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? '/api/v1' : 'http://localhost:5000/api/v1')

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

/**
 * An API failure that still knows what the server said.
 *
 * `unwrap` used to throw a plain Error carrying only a message, which loses
 * the one thing some callers have to know: whether the server actually
 * answered. "401, your session is over" and "I could not reach the server"
 * are opposite situations and were indistinguishable - so a restart or a
 * dropped connection read as being signed out.
 */
export class ApiError extends Error {
  /** undefined when the request never got an answer at all. */
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** True only when the server itself refused the request. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

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
    throw new ApiError(
      apiErrorMessage(error),
      axios.isAxiosError(error) ? error.response?.status : undefined,
    )
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
