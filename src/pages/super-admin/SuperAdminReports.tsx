import React, { useEffect, useState } from 'react'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, CreditCard, Download, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { formatBDT } from './superAdminLive'
import { getSuperAdminReports } from '../../services/admin.services'

interface MonthlyPoint {
  month: string
  revenue: number
  sales: number
}

interface PlatformReport {
  total_sales: number
  total_orders: number
  subscription_revenue: number
  monthly: MonthlyPoint[]
}

const EMPTY_REPORT: PlatformReport = {
  total_sales: 0,
  total_orders: 0,
  subscription_revenue: 0,
  monthly: [],
}

export default function SuperAdminReports() {
  const [report, setReport] = useState<PlatformReport>(EMPTY_REPORT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    setLoading(true)
    try {
      const data = await getSuperAdminReports()
      setReport(data || EMPTY_REPORT)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  function downloadCsv() {
    const lines = [
      'Month,Subscription Revenue,Owner Sales',
      ...report.monthly.map(point => `${point.month},${point.revenue},${point.sales}`),
      '',
      `Total owner sales,${report.total_sales}`,
      `Total orders,${report.total_orders}`,
      `Subscription revenue,${report.subscription_revenue}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `platform-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Reports"
        subtitle="Platform sales, revenue and owner performance reports"
        actions={
          <button className="btn-primary" onClick={downloadCsv}>
            <Download size={16} />
            Download report
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Total sales" value={formatBDT(report.total_sales)} icon={<TrendingUp size={20} />} color="green" />
        <StatCard title="Total orders" value={String(report.total_orders)} icon={<BarChart3 size={20} />} color="blue" />
        <StatCard title="Subscription revenue" value={formatBDT(report.subscription_revenue)} icon={<CreditCard size={20} />} color="orange" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-800">Revenue trend</h2>
          {loading ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">Loading chart...</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={report.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `৳${Number(v) / 1000}k`} />
                <Tooltip formatter={(value: number) => formatBDT(value)} />
                <Line type="monotone" dataKey="revenue" stroke="#1D9E75" strokeWidth={3} name="Revenue" />
                <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={3} name="Sales" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 font-semibold text-slate-800">Monthly breakdown</h2>
          <div className="space-y-2">
            {report.monthly.map(point => (
              <div key={point.month} className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left text-sm text-slate-700">
                <span className="font-medium">{point.month}</span>
                <span className="text-xs text-slate-500">
                  Rev {formatBDT(point.revenue)} · Sales {formatBDT(point.sales)}
                </span>
              </div>
            ))}
            {!loading && report.monthly.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">No data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
