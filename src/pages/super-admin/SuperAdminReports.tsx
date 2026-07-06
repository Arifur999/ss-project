import React from 'react'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Download, FileText, TrendingUp } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { formatBDT, getSummary, monthlyRevenue } from './superAdminData'

export default function SuperAdminReports() {
  const summary = getSummary()

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Reports"
        subtitle="Platform sales, revenue and owner performance reports"
        actions={
          <button className="btn-primary">
            <Download size={16} />
            Download report
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Total sales" value={formatBDT(summary.totalSales)} icon={<TrendingUp size={20} />} color="green" />
        <StatCard title="Total orders" value={String(summary.totalOrders)} icon={<BarChart3 size={20} />} color="blue" />
        <StatCard title="Report files" value="12" icon={<FileText size={20} />} color="orange" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-800">Revenue trend</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `৳${Number(v) / 1000}k`} />
              <Tooltip formatter={(value: number) => formatBDT(value)} />
              <Line type="monotone" dataKey="revenue" stroke="#1D9E75" strokeWidth={3} name="Revenue" />
              <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={3} name="Sales" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-800">Available reports</h2>
          <div className="space-y-2">
            {['Monthly platform summary', 'Owner performance', 'Payment reconciliation', 'Pending request audit', 'Service usage report'].map(item => (
              <button key={item} className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                {item}
                <Download size={14} className="text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
