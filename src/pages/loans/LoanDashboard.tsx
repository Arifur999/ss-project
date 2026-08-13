import React, { useEffect, useMemo, useState } from 'react'
import { PulseIcon as Activity, CalendarDotsIcon as CalendarDays, DownloadSimpleIcon as Download, CircleNotchIcon as Loader2, ChatTextIcon as MessageSquareText, PlusIcon as Plus, ScalesIcon as Scale, MagnifyingGlassIcon as Search, PaperPlaneTiltIcon as Send, UploadSimpleIcon as Upload, UsersIcon as Users, XIcon as X } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../context/LanguageContext'
import { buildLoanSummary, loanBalanceColor, loanBalanceLabel } from './loanUtils'
import { isLoanLenderTableMissing, mergeStoredAndLegacyLoanLenders, mergeStoredAndLoanLenders } from './loanFallback'
import { readSmsTemplates, type SmsTemplate } from '../../lib/smsTemplates'
import { formatDate } from '../../lib/utils'
import { sendSms as sendSmsApi } from '../../services/sms.services'

type SortBy = 'balance_desc' | 'balance_asc' | 'name_asc' | 'dena_first' | 'pawna_first'

export default function LoanDashboard() {
  const { formatCurr } = useLang()
  const navigate = useNavigate()
  const [lenders, setLenders] = useState<any[]>([])
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('balance_desc')

  // SMS sending (uses saved templates from the Marketing composer)
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [smsOpen, setSmsOpen] = useState(false)
  const [smsTargets, setSmsTargets] = useState<{ name: string; phone: string }[]>([])
  const [smsTemplateName, setSmsTemplateName] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [smsSending, setSmsSending] = useState(false)

  useEffect(() => {
    loadAll()
    setTemplates(readSmsTemplates())
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

  const summaries = useMemo(() => buildLoanSummary(lenders, loans), [lenders, loans])
  const personPhone = (item: any) => String(item?.lender?.phone || '').trim()

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = summaries.filter((item: any) =>
      !q || String(item.name || '').toLowerCase().includes(q) || personPhone(item).toLowerCase().includes(q)
    )
    const sorted = [...filtered]
    sorted.sort((a: any, b: any) => {
      switch (sortBy) {
        case 'balance_asc': return a.balance - b.balance
        case 'name_asc': return String(a.name || '').localeCompare(String(b.name || ''))
        case 'dena_first': return a.balance - b.balance // most negative (Dena) first
        case 'pawna_first': return b.balance - a.balance // most positive (Pawna) first
        case 'balance_desc':
        default: return b.balance - a.balance
      }
    })
    return sorted
  }, [summaries, search, sortBy])

  const totalReceived = summaries.reduce((s: number, item: any) => s + item.received, 0)
  const totalPaid = summaries.reduce((s: number, item: any) => s + item.paid, 0)
  const outstanding = summaries.reduce((s: number, item: any) => s + item.balance, 0)
  const totalDena = summaries.filter((item: any) => item.balance < 0).reduce((s: number, item: any) => s + Math.abs(item.balance), 0)
  const totalPawna = summaries.filter((item: any) => item.balance > 0).reduce((s: number, item: any) => s + item.balance, 0)
  const activeAccounts = summaries.filter((item: any) => item.balance !== 0).length
  const todayLabel = formatDate(new Date())

  // Displayed-row totals (reflect the current search filter).
  const shownOpening = displayed.reduce((s: number, i: any) => s + i.opening, 0)
  const shownReceived = displayed.reduce((s: number, i: any) => s + i.received + i.interest, 0)
  const shownPaid = displayed.reduce((s: number, i: any) => s + i.paid, 0)
  const shownBalance = displayed.reduce((s: number, i: any) => s + i.balance, 0)

  function openSmsForPerson(item: any) {
    const phone = personPhone(item)
    if (!phone) return toast.error(`${item.name} has no phone number`)
    setSmsTargets([{ name: item.name, phone }])
    prefillTemplate()
    setSmsOpen(true)
  }

  function openSmsForAll() {
    const targets = displayed
      .map((item: any) => ({ name: item.name, phone: personPhone(item) }))
      .filter((t: any) => t.phone)
    if (targets.length === 0) return toast.error('None of the listed persons have a phone number')
    setSmsTargets(targets)
    prefillTemplate()
    setSmsOpen(true)
  }

  function prefillTemplate() {
    const first = readSmsTemplates()
    setTemplates(first)
    if (first.length > 0) {
      setSmsTemplateName(first[0].name)
      setSmsMessage(first[0].message)
    } else {
      setSmsTemplateName('')
      setSmsMessage('')
    }
  }

  async function sendLoanSms() {
    const message = smsMessage.trim()
    if (!message) return toast.error('Write a message or pick a template')
    const recipients = smsTargets.map(t => t.phone).filter(Boolean)
    if (recipients.length === 0) return toast.error('No valid recipients')
    setSmsSending(true)
    try {
      const result = await sendSmsApi({ recipients, message })
      toast.success(`SMS sent to ${result.recipients} recipient${result.recipients === 1 ? '' : 's'} (${result.credits_used} credits used)`)
      setSmsOpen(false)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send SMS')
    } finally {
      setSmsSending(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full" /></div>

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
      green: 'bg-neutral-100 text-navy-900',
      red: 'bg-red-50 text-brand-red',
      blue: 'bg-slate-100 text-slate-700',
      orange: 'bg-brand-blue-soft text-brand-blue',
      purple: 'bg-slate-100 text-slate-700',
      default: 'bg-slate-100 text-slate-700',
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

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {/* Toolbar: title + search + sort + send-to-all */}
        <div className="flex flex-shrink-0 flex-col gap-3 px-2 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="font-semibold text-slate-900">Loan / Outstanding by Bank / Person</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." className="input pl-9" />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className="input min-w-[150px] max-w-[190px]" title="Sort by">
              <option value="balance_desc">Balance (high-low)</option>
              <option value="balance_asc">Balance (low-high)</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="dena_first">Dena first</option>
              <option value="pawna_first">Pawna first</option>
            </select>
            <button type="button" onClick={openSmsForAll} className="btn-primary !px-3 !py-2 text-sm" title="Send SMS to everyone in the list">
              <MessageSquareText size={16} /> Send SMS
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Bank / Person</th>
                <th className="px-4 py-3 text-right">Opening Balance</th>
                <th className="px-4 py-3 text-right">Receive</th>
                <th className="px-4 py-3 text-right">Payment</th>
                <th className="px-4 py-3 text-right">Current Dena/Pawna</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((item: any, index: number) => {
                const phone = personPhone(item)
                return (
                  <tr key={item.key} className="border-b border-slate-100 last:border-b-0 hover:bg-white/60">
                    <td className="px-4 py-5 font-semibold text-slate-700">{index + 1}</td>
                    <td className="px-4 py-5">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      {phone && <div className="text-xs text-slate-400">{phone}</div>}
                    </td>
                    <td className="px-4 py-5 text-right">{signedAmount(item.opening)}</td>
                    <td className="px-4 py-5 text-right font-semibold tabular-nums text-brand-green">{formatCurr(item.received + item.interest)}</td>
                    <td className="px-4 py-5 text-right font-semibold tabular-nums text-brand-red">{formatCurr(item.paid)}</td>
                    <td className="px-4 py-5 text-right">{signedAmount(item.balance)}</td>
                    <td className="px-4 py-5 text-center">
                      <button
                        type="button"
                        onClick={() => openSmsForPerson(item)}
                        disabled={!phone}
                        title={phone ? `Send SMS to ${item.name}` : 'No phone number'}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <MessageSquareText size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {displayed.length > 0 && (
                <tr className="bg-slate-100/80">
                  <td colSpan={2} className="px-4 py-5 font-bold text-slate-900">Total</td>
                  <td className="px-4 py-5 text-right">{signedAmount(shownOpening)}</td>
                  <td className="px-4 py-5 text-right font-semibold tabular-nums text-brand-green">{formatCurr(shownReceived)}</td>
                  <td className="px-4 py-5 text-right font-semibold tabular-nums text-brand-red">{formatCurr(shownPaid)}</td>
                  <td className="px-4 py-5 text-right">{signedAmount(shownBalance)}</td>
                  <td className="px-4 py-5" />
                </tr>
              )}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">{search ? 'No matching accounts' : 'No loan accounts'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 inline-flex flex-shrink-0 flex-wrap items-center gap-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600 shadow-sm">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-brand-green" />Pawna (You Receive)</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-brand-red" />Dena (You Pay)</span>
      </div>

      {/* SMS modal */}
      {smsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Send SMS</h3>
                <p className="text-xs text-slate-500">{smsTargets.length} recipient{smsTargets.length === 1 ? '' : 's'}{smsTargets.length === 1 ? ` · ${smsTargets[0].name}` : ''}</p>
              </div>
              <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={() => setSmsOpen(false)}><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="label" htmlFor="loan-dashboard-f1">Template</label>
                <select id="loan-dashboard-f1"
                  className="input"
                  value={smsTemplateName}
                  onChange={e => {
                    const name = e.target.value
                    setSmsTemplateName(name)
                    const tpl = templates.find(t => t.name === name)
                    if (tpl) setSmsMessage(tpl.message)
                  }}
                >
                  <option value="">{templates.length ? 'Select a saved template' : 'No saved templates yet'}</option>
                  {templates.map((t, i) => <option key={`${i}-${t.name}`} value={t.name}>{t.name}</option>)}
                </select>
                {templates.length === 0 && (
                  <p className="mt-1 text-xs text-slate-400">Save templates from the Marketing page (by Campaign Name) to reuse them here.</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="loan-dashboard-f2">Message</label>
                <textarea id="loan-dashboard-f2" className="input min-h-[120px] resize-none leading-6" value={smsMessage} onChange={e => setSmsMessage(e.target.value)} placeholder="Type your SMS message..." />
              </div>
              {smsTargets.length > 1 && (
                <p className="text-xs text-slate-500">Sending to: {smsTargets.slice(0, 6).map(t => t.name).join(', ')}{smsTargets.length > 6 ? ` +${smsTargets.length - 6} more` : ''}</p>
              )}
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-5">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setSmsOpen(false)}>Cancel</button>
              <button className="btn-primary flex-1 justify-center disabled:opacity-60" disabled={smsSending} onClick={sendLoanSms}>
                {smsSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {smsSending ? 'Sending...' : 'Send SMS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
