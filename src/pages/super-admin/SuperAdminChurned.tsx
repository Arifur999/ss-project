import React, { useEffect, useMemo, useState } from 'react'
import { Mail, RefreshCw, Search, Send, TrendingDown, UserX, X } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import { getChurnedCustomers, sendFollowupEmail } from '../../services/admin.services'

type PaidCustomer = {
  id: string
  email: string
  full_name: string
  phone: string
  business_name: string
  plan: string
  plan_type: string
  status: string
  start_date: string | null
  expiry_date: string | null
  days_left: number | null
  last_paid_amount: number
  total_paid: number
  paid_count: number
  last_active: string | null
}

const money = (n: number) => 'Tk ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')
const planLabel = (planType: string) => (planType === 'yearly' ? 'Yearly' : planType === 'monthly' ? 'Monthly' : planType || '-')

export default function SuperAdminChurned() {
  const [customers, setCustomers] = useState<PaidCustomer[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  // Follow-up email composer
  const [target, setTarget] = useState<PaidCustomer | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    try {
      setLoading(true)
      const data = await getChurnedCustomers()
      setCustomers(Array.isArray(data) ? data : [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load churned customers')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers.filter(c => !q || [c.business_name, c.full_name, c.email, c.phone].some(v => String(v || '').toLowerCase().includes(q)))
  }, [customers, query])

  const lostRevenue = useMemo(() => customers.reduce((sum, c) => sum + Number(c.total_paid || 0), 0), [customers])

  function openComposer(customer: PaidCustomer) {
    setTarget(customer)
    setSubject(`We miss you at ${customer.business_name || 'your business workspace'}`)
    setMessage(
      `Hi ${customer.full_name || 'there'},\n\n` +
      `We noticed your subscription for "${customer.business_name || 'your business'}" has expired. ` +
      `We'd love to have you back — your data is safe and you can pick up right where you left off.\n\n` +
      `Reply to this email or reach us anytime if you have any questions.\n\nThank you.`
    )
  }

  async function send() {
    if (!target) return
    if (!message.trim()) return toast.error('Write a message first')
    setSending(true)
    try {
      const result = await sendFollowupEmail(target.id, { subject: subject.trim(), message: message.trim() })
      toast.success(result.sent ? `Email sent to ${result.email}` : 'Email is not configured on the server yet')
      setTarget(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="Churned Customers" subtitle="Owners who paid before but are no longer active — follow up to win them back" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={<UserX size={20} />} label="Churned Customers" value={String(customers.length)} />
        <StatCard icon={<TrendingDown size={20} />} label="Lifetime Revenue (lapsed)" value={money(lostRevenue)} tone="red" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by business, name, email, phone..." className="input pl-9" />
        </div>
        <button onClick={refresh} className="btn-secondary flex items-center gap-2 bg-white"><RefreshCw size={15} /> Refresh</button>
      </div>

      <TableScroller wrapClassName="card p-0" className="overflow-x-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
          </div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="table-header">
              <tr className="whitespace-nowrap">
                <th className="w-12 px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Last Plan</th>
                <th className="px-4 py-3 text-right">Total Paid</th>
                <th className="px-4 py-3 text-left">Expired On</th>
                <th className="px-4 py-3 text-left">Last Active</th>
                <th className="px-4 py-3 text-center">Follow up</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer, index) => (
                <tr key={customer.id} className="table-row">
                  <td className="px-4 py-2.5 text-slate-500">{index + 1}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-800">{customer.business_name || customer.full_name || '-'}</p>
                    <p className="text-xs text-slate-500">{customer.full_name} · {customer.email}</p>
                    <p className="text-xs text-slate-400">{customer.phone}</p>
                  </td>
                  <td className="px-4 py-2.5"><span className="badge-orange">{planLabel(customer.plan_type)}</span></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-slate-800">{money(customer.total_paid)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-brand-red">{formatDate(customer.expiry_date)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{customer.last_active ? formatDate(customer.last_active) : 'Never'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center">
                      <button onClick={() => openComposer(customer)} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">
                        <Mail size={13} /> Email
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">No churned customers</td></tr>
              )}
            </tbody>
          </table>
        )}
      </TableScroller>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && setTarget(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950">Follow-up email</h3>
                <p className="mt-0.5 text-sm text-slate-500">To {target.full_name || target.business_name} · {target.email}</p>
              </div>
              <button onClick={() => setTarget(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Subject</label>
                <input className="input" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="label">Message</label>
                <textarea className="input min-h-[180px] resize-y" value={message} onChange={e => setMessage(e.target.value)} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setTarget(null)} disabled={sending} className="btn-secondary bg-white">Cancel</button>
              <button onClick={send} disabled={sending} className="btn-primary">
                <Send size={16} /> {sending ? 'Sending...' : 'Send email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: string; tone?: 'default' | 'red' }) {
  const valueColor = tone === 'red' ? 'text-brand-red' : 'text-slate-900'
  return (
    <div className="card flex items-center gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-0.5 text-xl font-bold ${valueColor}`}>{value}</p>
      </div>
    </div>
  )
}
