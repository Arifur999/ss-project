import React, { useEffect, useState } from 'react'
import { Activity, CalendarDays, CreditCard, Download, FileText, Plus, Scale, Upload, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { useLang } from '../../context/LanguageContext'
import { buildLoanSummary, loanBalanceColor, loanBalanceLabel, loanDisplayName, transactionAmounts, transactionLabel } from './loanUtils'
import { isLoanLenderTableMissing, mergeStoredAndLegacyLoanLenders, mergeStoredAndLoanLenders } from './loanFallback'

export default function LoanDashboard() {
  const { formatCurr } = useLang()
  const navigate = useNavigate()
  const [lenders, setLenders] = useState<any[]>([])
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('loan-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_lenders' }, loadAll)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadAll() {
    const [lenderRes, loanRes] = await Promise.all([
      supabase.from('loan_lenders').select('*'),
      supabase.from('loans').select('*, loan_lenders(*)').order('date', { ascending: false }).order('created_at', { ascending: false }),
    ])
    if (isLoanLenderTableMissing(lenderRes.error) || isLoanLenderTableMissing(loanRes.error)) {
      const legacyLoanRes = await supabase.from('loans').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })
      const legacyLoans = legacyLoanRes.data || []
      setLoans(legacyLoans)
      setLenders(mergeStoredAndLegacyLoanLenders(legacyLoans))
      setLoading(false)
      return
    }
    setLenders(mergeStoredAndLoanLenders(lenderRes.data || []))
    setLoans(loanRes.data || [])
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full" /></div>

  const summaries = buildLoanSummary(lenders, loans).sort((a: any, b: any) => b.balance - a.balance)
  const totalOpening = summaries.reduce((s: number, item: any) => s + item.opening, 0)
  const totalReceived = summaries.reduce((s: number, item: any) => s + item.received, 0)
  const totalPaid = summaries.reduce((s: number, item: any) => s + item.paid, 0)
  const totalInterest = summaries.reduce((s: number, item: any) => s + item.interest, 0)
  const outstanding = summaries.reduce((s: number, item: any) => s + item.balance, 0)
  const totalDena = summaries.filter((item: any) => item.balance < 0).reduce((s: number, item: any) => s + Math.abs(item.balance), 0)
  const totalPawna = summaries.filter((item: any) => item.balance > 0).reduce((s: number, item: any) => s + item.balance, 0)
  const activeAccounts = summaries.filter((item: any) => item.balance !== 0).length
  const recent = loans.slice(0, 8)
  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  function signedAmount(amount: number) {
    const label = loanBalanceLabel(amount)
    return (
      <div className={`font-semibold tabular-nums ${loanBalanceColor(amount)}`}>
        <div>{formatCurr(amount)}</div>
        <div className="text-xs">({label})</div>
      </div>
    )
  }

  function DashboardCard({ title, value, subtitle, icon, tone = 'default' }: { title: string; value: string; subtitle: string; icon: React.ReactNode; tone?: 'green' | 'red' | 'blue' | 'orange' | 'purple' | 'default' }) {
    const tones = {
      green: 'bg-green-50 text-brand-green',
      red: 'bg-red-50 text-brand-red',
      blue: 'bg-blue-50 text-blue-600',
      orange: 'bg-orange-50 text-orange-600',
      purple: 'bg-purple-50 text-purple-600',
      default: 'bg-slate-50 text-slate-600',
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            <p className="mt-2 break-words text-2xl font-bold tabular-nums text-slate-900">{value}</p>
            <p className={`mt-3 text-xs font-medium ${subtitle.toLowerCase().includes('dena') ? 'text-brand-red' : 'text-slate-600'}`}>{subtitle}</p>
          </div>
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}>
            {icon}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="mb-8 flex flex-shrink-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Loan Management Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Manage loans, track outstanding and transactions</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary bg-white px-4">
            <CalendarDays size={16} />
            {todayLabel}
          </button>
          <button type="button" onClick={() => navigate('/loan-management/lenders')} className="btn-primary px-4">
            <Plus size={16} />
            Add Loan / Person
          </button>
        </div>
      </div>

      <div className="mb-6 grid flex-shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <DashboardCard title="Total Dena" value={formatCurr(totalDena)} subtitle="Negative balances" icon={<Upload size={20} />} tone="red" />
        <DashboardCard title="Total Pawna" value={formatCurr(totalPawna)} subtitle="Positive balances" icon={<Scale size={20} />} tone="green" />
        <DashboardCard title="Total Paid" value={formatCurr(totalPaid)} subtitle="Payment made" icon={<Download size={20} />} tone="blue" />
        <DashboardCard title="Total Received" value={formatCurr(totalReceived)} subtitle="Cash received" icon={<Download size={20} />} tone="orange" />
        <DashboardCard title="Net Balance" value={formatCurr(outstanding)} subtitle={`${loanBalanceLabel(outstanding)} (${outstanding < 0 ? '-' : '+'})`} icon={<Activity size={20} />} tone="purple" />
        <DashboardCard title="Active Accounts" value={String(activeAccounts)} subtitle="Total Active" icon={<Users size={20} />} tone="blue" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.85fr)]">
        <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex-shrink-0 px-2 py-3 font-semibold text-slate-900">Loan / Outstanding by Bank / Person</div>
          <div className="flex-shrink-0 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <colgroup>
                <col className="w-14" />
                <col />
                <col className="w-[170px]" />
                <col className="w-[130px]" />
                <col className="w-[130px]" />
                <col className="w-[180px]" />
              </colgroup>
              <thead>
                <tr className="rounded-lg bg-blue-50 text-xs uppercase tracking-wide text-slate-700">
                  <th className="rounded-l-lg px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Bank / Person</th>
                  <th className="px-4 py-3 text-right">Opening Balance</th>
                  <th className="px-4 py-3 text-right">Receive</th>
                  <th className="px-4 py-3 text-right">Payment</th>
                  <th className="rounded-r-lg px-4 py-3 text-right">Current Dena/Pawna</th>
                </tr>
              </thead>
            </table>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <colgroup>
                <col className="w-14" />
                <col />
                <col className="w-[170px]" />
                <col className="w-[130px]" />
                <col className="w-[130px]" />
                <col className="w-[180px]" />
              </colgroup>
              <tbody>
                {summaries.map((item: any, index: number) => (
                  <tr key={item.key} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-5 font-semibold text-slate-700">{index + 1}</td>
                    <td className="px-4 py-5 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-5 text-right">{signedAmount(item.opening)}</td>
                    <td className="px-4 py-5 text-right font-semibold tabular-nums text-brand-green">{formatCurr(item.received + item.interest)}</td>
                    <td className="px-4 py-5 text-right font-semibold tabular-nums text-brand-red">{formatCurr(item.paid)}</td>
                    <td className="px-4 py-5 text-right">{signedAmount(item.balance)}</td>
                  </tr>
                ))}
                {summaries.length > 0 && (
                  <tr className="bg-blue-50/80">
                    <td colSpan={2} className="rounded-l-lg px-4 py-5 font-bold text-slate-900">Total</td>
                    <td className="px-4 py-5 text-right">{signedAmount(totalOpening)}</td>
                    <td className="px-4 py-5 text-right font-semibold tabular-nums text-brand-green">{formatCurr(totalReceived + totalInterest)}</td>
                    <td className="px-4 py-5 text-right font-semibold tabular-nums text-brand-red">{formatCurr(totalPaid)}</td>
                    <td className="rounded-r-lg px-4 py-5 text-right">{signedAmount(outstanding)}</td>
                  </tr>
                )}
                {summaries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">No loan accounts</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-5 flex flex-shrink-0 items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">Recent Transactions</h2>
            <button type="button" onClick={() => navigate('/loan-management/transactions')} className="text-sm font-semibold text-blue-600 hover:text-blue-700">View All</button>
          </div>
          <div className="flex-shrink-0 overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <colgroup>
                <col className="w-[125px]" />
                <col />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
              </colgroup>
              <thead>
                <tr className="rounded-lg bg-blue-50 text-xs uppercase tracking-wide text-slate-700">
                  <th className="rounded-l-lg px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Bank / Person</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="rounded-r-lg px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
            </table>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[500px] text-sm">
              <colgroup>
                <col className="w-[125px]" />
                <col />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
              </colgroup>
              <tbody>
                {recent.map(record => {
                  const amounts = transactionAmounts(record)
                  const amount = amounts.received || amounts.paid || amounts.interest
                  return (
                    <tr key={record.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-4">{formatDate(record.date)}</td>
                      <td className="px-4 py-4 font-medium">{loanDisplayName(record)}</td>
                      <td className="px-4 py-4"><span className="badge-blue">{transactionLabel(amounts.type)}</span></td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums">{formatCurr(amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {recent.length === 0 && (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-blue-50 text-blue-200">
                <FileText size={42} />
              </div>
              <p className="text-sm font-semibold text-slate-700">No recent transactions</p>
              <p className="mt-1 text-xs text-slate-500">Transactions will appear here</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 inline-flex flex-shrink-0 flex-wrap items-center gap-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600 shadow-sm">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-brand-green" />Pawna (You Receive)</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-brand-red" />Dena (You Pay)</span>
      </div>
    </div>
  )
}
