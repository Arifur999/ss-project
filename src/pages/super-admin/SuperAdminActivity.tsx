import React from 'react'
import { Activity, ShieldCheck } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import { activities } from './superAdminData'

export default function SuperAdminActivity() {
  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Logs and Activity" subtitle="Audit trail for owner, payment, role and platform changes" />

      <div className="card">
        <div className="space-y-4">
          {activities.map((activity, index) => (
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
