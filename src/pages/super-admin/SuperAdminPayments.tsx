import React from 'react'
import { CreditCard, Download, RefreshCcw } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { formatBDT, payments } from './superAdminData'

const badgeClass: Record<string, string> = {
  paid: 'badge-green',
  pending: 'badge-orange',
  failed: 'badge-red',
  refunded: 'badge-blue',
}

export default function SuperAdminPayments() {
  const paid = payments.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0)
  const pending = payments.filter(payment => payment.status === 'pending').reduce((sum, payment) => sum + payment.amount, 0)

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Payments and Transactions"
        subtitle="Monitor owner subscriptions, invoices and transaction status"
        actions={
          <button className="btn-secondary">
            <Download size={16} />
            Export
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
          <table className="w-full min-w-[760px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Method</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(payment => (
                <tr key={payment.id} className="table-row">
                  <td className="px-4 py-3 font-medium text-slate-800">{payment.id}</td>
                  <td className="px-4 py-3 text-slate-600">{payment.owner}</td>
                  <td className="px-4 py-3 text-slate-600">{payment.method}</td>
                  <td className="px-4 py-3">
                    <span className={badgeClass[payment.status]}>{payment.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{payment.date}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatBDT(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
