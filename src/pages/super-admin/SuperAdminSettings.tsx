import React, { useState } from 'react'
import { Bell, Save, Shield, ToggleLeft, ToggleRight } from 'lucide-react'
import PageHeader from '../../components/PageHeader'

export default function SuperAdminSettings() {
  const [darkMode, setDarkMode] = useState(false)
  const [ownerApproval, setOwnerApproval] = useState(true)
  const [notifications, setNotifications] = useState(true)

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Super Admin Settings"
        subtitle="Manage role access, notifications, dashboard mode and platform controls"
        actions={
          <button className="btn-primary">
            <Save size={16} />
            Save settings
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Shield size={18} className="text-brand-green" />
            Role permissions
          </h2>
          <div className="space-y-3">
            {['Owner manage', 'Product / service manage', 'Payment / transaction manage', 'Reports view', 'Settings change'].map(permission => (
              <label key={permission} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <span className="text-sm font-medium text-slate-700">{permission}</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 accent-brand-green" />
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Bell size={18} className="text-brand-green" />
            Platform controls
          </h2>
          <div className="space-y-3">
            {[
              ['Dark mode', darkMode, setDarkMode],
              ['Manual owner approval', ownerApproval, setOwnerApproval],
              ['Notification send enabled', notifications, setNotifications],
            ].map(([label, enabled, setter]) => (
              <button
                key={label as string}
                onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(!(enabled as boolean))}
                className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left"
              >
                <span className="text-sm font-medium text-slate-700">{label as string}</span>
                {enabled ? <ToggleRight className="text-brand-green" /> : <ToggleLeft className="text-slate-400" />}
              </button>
            ))}
          </div>
        </div>

        <div className="card xl:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-800">Send notification</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input className="input" placeholder="Notification title" />
            <input className="input" placeholder="Message to all owners" />
            <button className="btn-primary justify-center">Send</button>
          </div>
        </div>
      </div>
    </div>
  )
}
