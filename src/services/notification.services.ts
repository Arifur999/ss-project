import { http } from '../lib/httpClient'

export type UserNotification = {
  id: string
  title: string
  message: string
  created_at: string
  read: boolean
}

export type AdminNotification = {
  id: string
  title: string
  message: string
  created_by: string
  created_at: string
  read_count: number
}

// ---- Any authenticated user ----
export const getMyNotifications = () =>
  http.get<{ items: UserNotification[]; unread: number }>('/notifications/my')
export const markNotificationsRead = () => http.post<{ marked: number }>('/notifications/mark-read')

// ---- Super admin ----
export const sendNotification = (payload: { title: string; message: string }) =>
  http.post<AdminNotification>('/notifications', payload)
export const getAdminNotifications = () => http.get<AdminNotification[]>('/notifications')
export const deleteNotification = (id: string) => http.delete<{ id: string }>(`/notifications/${id}`)
