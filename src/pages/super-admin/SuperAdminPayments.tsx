import React, { useEffect, useState } from 'react'
import { CreditCard, Download, Eye, Mail, MapPin, Phone, RefreshCcw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import StatCard from '../../components/StatCard'
import { formatBDT } from './superAdminLive'
import { formatDate } from '../../lib/utils'
import { getSubscriptionPayments, updateSubscriptionPayment } from '../../services/admin.services'

const badgeClass: Record<string, string> = {
  paid: 'badge-green',
  pending: 'badge-orange',
  failed: 'badge-red',
  refunded: 'badge-blue',
}

interface OwnerContact {
  name: string
  email: string
  phone: string
  business: string
  address: string
  planType: string
  planStatus: string
  expiry: string
  joined: string
}

interface PaymentRow {
  id: string
  invoice: string
  owner: string
  method: string
  senderNumber: string
  trxId: string
  status: string
  date: string
  amount: number
  contact: OwnerContact
}

export default function SuperAdminPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  // Row whose owner contact card is open (eye icon), so a pending payment can
  // be followed up on by phone/email without leaving the page.
  const [contactRow, setContactRow] = useState<PaymentRow | null>(null)

  useEffect(() => {
    loadPayments()
  }, [])

  async function loadPayments() {
    setLoading(true)
    try {
      const rows: any[] = await getSubscriptionPayments()
      setPayments((rows || []).map((row) => ({
        id: row.id,
        invoice: row.invoice_no || row.id,
        owner: row.owner?.subscription?.business_name || row.owner?.full_name || row.owner?.email || '-',
        method: row.method || '-',
        senderNumber: row.sender_number || '-',
        trxId: row.trx_id || '-',
        status: row.status || 'pending',
        date: formatDate(row.date) || '-',
        amount: Number(row.amount || 0),
        contact: {
          name: row.owner?.full_name || '-',
          email: row.owner?.email || '-',
          phone: row.owner?.phone || '-',
          business: row.owner?.subscription?.business_name || '-',
          address: row.owner?.subscription?.address || '-',
          planType: row.owner?.subscription?.plan_type || '-',
          planStatus: row.owner?.subscription?.plan_status || '-',
          expiry: formatDate(row.owner?.subscription?.expiry_date) || '-',
          joined: formatDate(row.owner?.created_at) || '-',
        },
      })))
    } catch (error: any) {
      toast.error(error.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  async function markPayment(paymentId: string, status: 'paid' | 'failed' | 'refunded') {
    setUpdatingId(paymentId)
    try {
      // Confirming a payment also activates the owner's chosen plan.
      await updateSubscriptionPayment(paymentId, { status })
      toast.success(`Payment marked as ${status}`)
      await loadPayments()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update payment')
    } finally {
      setUpdatingId(null)
    }
  }

  const paid = payments.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0)
  const pending = payments.filter(payment => payment.status === 'pending').reduce((sum, payment) => sum + payment.amount, 0)

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Payments and Transactions"
        subtitle="Monitor owner subscriptions, invoices and transaction status"
        actions={
          <button className="btn-secondary" onClick={loadPayments}>
            <Download size={16} />
            Refresh
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Paid amount" value={formatBDT(paid)} icon={<CreditCard size={20} />} color="green" />
        <StatCard title="Pending amount" value={formatBDT(pending)} icon={<RefreshCcw size={20} />} color="orange" />
        <StatCard title="Transactions" value={String(payments.length)} icon={<CreditCard size={20} />} color="blue" />
      </div>

      <div className="card overflow-hidden p-0">
        <TableScroller className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Method</th>
                <th className="px-4 py-3 text-left">Sender bKash No.</th>
                <th className="px-4 py-3 text-left">TrxID</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading payments...</td>
                </tr>
              )}
              {!loading && payments.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">No subscription payments yet</td>
                </tr>
              )}
              {!loading && payments.map(payment => (
                <tr key={payment.id} className="table-row">
                  <td className="px-4 py-3 font-medium text-slate-800">{payment.invoice}</td>
                  <td className="px-4 py-3 text-slate-600">{payment.owner}</td>
                  <td className="px-4 py-3 text-slate-600">{payment.method}</td>
                  <td className="px-4 py-3 text-slate-600">{payment.senderNumber}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{payment.trxId}</td>
                  <td className="px-4 py-3">
                    <span className={badgeClass[payment.status] || 'badge-orange'}>{payment.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{payment.date}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatBDT(payment.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900"
                        onClick={() => setContactRow(payment)}
                        title="View owner details"
                      >
                        <Eye size={15} />
                      </button>
                      {payment.status === 'pending' ? (
                        <>
                          <button
                            className="btn-secondary !px-2 !py-1 text-xs"
                            disabled={updatingId === payment.id}
                            onClick={() => markPayment(payment.id, 'failed')}
                          >
                            Fail
                          </button>
                          <button
                            className="btn-primary !px-2 !py-1 text-xs"
                            disabled={updatingId === payment.id}
                            onClick={() => markPayment(payment.id, 'paid')}
                          >
                            Mark Paid
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </div>

      {contactRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={() => setContactRow(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{contactRow.contact.name}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{contactRow.contact.business}</p>
              </div>
              <button onClick={() => setContactRow(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <ContactLine icon={<Phone size={15} />} label="Phone" value={contactRow.contact.phone} href={contactRow.contact.phone !== '-' ? `tel:${contactRow.contact.phone.replace(/\s+/g, '')}` : undefined} />
              <ContactLine icon={<Mail size={15} />} label="Email" value={contactRow.contact.email} href={contactRow.contact.email !== '-' ? `mailto:${contactRow.contact.email}` : undefined} />
              <ContactLine icon={<MapPin size={15} />} label="Address" value={contactRow.contact.address} />

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                <Detail label="Plan" value={contactRow.contact.planType} />
                <Detail label="Plan status" value={contactRow.contact.planStatus} />
                <Detail label="Expires" value={contactRow.contact.expiry} />
                <Detail label="Joined" value={contactRow.contact.joined} />
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">This payment</p>
                <div className="grid grid-cols-2 gap-3">
                  <Detail label="Invoice" value={contactRow.invoice} />
                  <Detail label="Amount" value={formatBDT(contactRow.amount)} />
                  <Detail label="Paid from" value={contactRow.senderNumber} />
                  <Detail label="TrxID" value={contactRow.trxId} />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 p-5">
              <button onClick={() => setContactRow(null)} className="btn-secondary w-full justify-center">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ContactLine({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {href ? (
          <a href={href} className="break-words font-bold text-slate-900 hover:underline">{value}</a>
        ) : (
          <p className="break-words font-medium text-slate-800">{value}</p>
        )}
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 break-words font-semibold text-slate-800">{value}</p>
    </div>
  )
}
