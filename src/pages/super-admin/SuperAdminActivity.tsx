import React, { useEffect, useState } from 'react'
import { Activity, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import { getAdminActivities } from '../../services/admin.services'

interface ActivityRow {
  title: string
  type: string
  detail: string
  time: string
}

const SECURITY_ACTIONS = new Set(['owner_blocked', 'owner_deleted', 'subscription_updated'])

function actionTitle(action: string) {
  return String(action || 'activity')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function timeAgo(value: string) {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return '-'
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  return 'just now'
}

export default function SuperAdminActivity() {
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[] = await getAdminActivities(100)
        setActivities((rows || []).map(row => ({
          title: actionTitle(row.action),
          type: SECURITY_ACTIONS.has(row.action) ? 'security' : 'activity',
          detail: [row.detail, row.actor_email && `by ${row.actor_email}`].filter(Boolean).join(' — '),
          time: timeAgo(row.created_at),
        })))
      } catch (error: any) {
        toast.error(error.message || 'Failed to load activities')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Logs and Activity" subtitle="Audit trail for owner, payment, role and platform changes" />

      <div className="card">
        <div className="space-y-4">
          {loading && <p className="py-6 text-center text-sm text-slate-400">Loading activity...</p>}
          {!loading && activities.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No activity recorded yet</p>
          )}
          {!loading && activities.map((activity, index) => (
            <div key={`${activity.title}-${index}`} className="flex gap-3 rounded-lg border border-slate-100 p-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-green-50 text-brand-green">
                {activity.type === 'security' ? <ShieldCheck size={18} /> : <Activity size={18} />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                  <p className="font-medium text-slate-800">{activity.title}</p>
                  <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-500">{activity.type}</span>
                </div>
                <p className="text-sm text-slate-500">{activity.detail}</p>
                <p className="mt-1 text-xs text-slate-400">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
