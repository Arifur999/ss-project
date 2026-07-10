import React, { useEffect, useState } from 'react'
import { CreditCard, Download, RefreshCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { formatBDT } from './superAdminLive'
import { getSubscriptionPayments, updateSubscriptionPayment } from '../../services/admin.services'

const badgeClass: Record<string, string> = {
  paid: 'badge-green',
  pending: 'badge-orange',
  failed: 'badge-red',
  refunded: 'badge-blue',
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
}

export default function SuperAdminPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

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
        date: row.date ? new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
        amount: Number(row.amount || 0),
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
        <div className="overflow-x-auto">
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
                    {payment.status === 'pending' ? (
                      <div className="flex justify-end gap-2">
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
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
