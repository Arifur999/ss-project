import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Printer, Save, Pencil, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { confirmAction } from '../../components/ConfirmDialog'
import { loanDisplayName, transactionAmounts, transactionLabel } from './loanUtils'
import { isLoanLenderTableMissing, mergeStoredAndLegacyLoanLenders, mergeStoredAndLoanLenders } from './loanFallback'
import { addRecycleItem } from '../../lib/recycleBin'

type LoanTransactionValidationErrors = Partial<Record<'date' | 'lender_id' | 'transaction_type' | 'amount' | 'account_id', string>>

const REQUIRED_FIELD_MESSAGE = 'This field is required!'

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatPrintAmount(value: number) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default function LoanTransactions() {
  const { formatCurr } = useLang()
  const { user, profile } = useAuth()
  const [records, setRecords] = useState<any[]>([])
  const [lenders, setLenders] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [usingFallback, setUsingFallback] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [filterLenderName, setFilterLenderName] = useState('')
  const [errors, setErrors] = useState<LoanTransactionValidationErrors>({})
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], lender_id: '', transaction_type: 'receive', amount: 0, account_id: '', notes: '' })

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('loan-transactions-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_lenders' }, loadAll)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function loanTypeFromLender(lender: any) {
    return String(lender?.lender_type || '').toLowerCase().includes('bank') ? 'bank' : 'personal'
  }

  async function loadAll() {
    const [loanRes, lenderRes, accountRes] = await Promise.all([
      supabase.from('loans').select('*, loan_lenders(*)').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('loan_lenders').select('*').eq('is_active', true).order('name'),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
    ])
    if (isLoanLenderTableMissing(loanRes.error) || isLoanLenderTableMissing(lenderRes.error)) {
      const legacyLoanRes = await supabase.from('loans').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })
      const legacyLoans = legacyLoanRes.data || []
      setUsingFallback(true)
      setRecords(legacyLoans)
      setLenders(mergeStoredAndLegacyLoanLenders(legacyLoans, true))
      setAccounts(accountRes.data || [])
      return
    }
    setUsingFallback(false)
    setRecords(loanRes.data || [])
    setLenders(mergeStoredAndLoanLenders(lenderRes.data || [], true))
    setAccounts(accountRes.data || [])
  }

  function resetForm() {
    setEditingId(null)
    setShowModal(false)
    setErrors({})
    setForm({ date: new Date().toISOString().split('T')[0], lender_id: '', transaction_type: 'receive', amount: 0, account_id: '', notes: '' })
  }

  function editRecord(record: any) {
    const amounts = transactionAmounts(record)
    const fallbackLender = lenders.find(lender => lender.name === record.lender_name)
    setEditingId(record.id)
    setForm({
      date: record.date,
      lender_id: record.lender_id || fallbackLender?.id || '',
      transaction_type: amounts.type === 'payment' ? 'payment' : 'receive',
      amount: amounts.received || amounts.paid,
      account_id: record.account_id || '',
      notes: record.notes || '',
    })
    setErrors({})
    setShowModal(true)
  }

  const requiredLabel = (label: string) => (
    <>
      {label} <span className="text-brand-red">*</span>
    </>
  )

  const inputClass = (field: keyof LoanTransactionValidationErrors) =>
    `input ${errors[field] ? 'border-red-500 focus:ring-red-500' : ''}`

  const clearError = (field: keyof LoanTransactionValidationErrors) => {
    if (!errors[field]) return
    setErrors(current => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function buildPayload() {
    const lender = lenders.find(l => l.id === form.lender_id)
    const account = accounts.find(a => a.id === form.account_id)
    const amount = Number(form.amount || 0)
    const lenderId = isUuid(form.lender_id) ? form.lender_id : null
    if (usingFallback) {
      return {
        date: form.date,
        lender_name: lender?.name || '',
        loan_type: loanTypeFromLender(lender),
        transaction_type: form.transaction_type,
        received_amount: form.transaction_type === 'receive' ? amount : 0,
        payment_amount: form.transaction_type === 'payment' ? amount : 0,
        account_id: form.account_id || null,
        account_name: account?.name || '',
        notes: form.notes,
        created_by: user?.id,
      }
    }

    const ownerId = profile?.owner_id || user?.id

    return {
      date: form.date,
      lender_id: lenderId,
      lender_name: lender?.name || '',
      loan_type: loanTypeFromLender(lender),
      transaction_type: form.transaction_type,
      received_amount: form.transaction_type === 'receive' ? amount : 0,
      payment_amount: form.transaction_type === 'payment' ? amount : 0,
      interest_amount: 0,
      account_id: form.account_id || null,
      account_name: account?.name || '',
      notes: form.notes,
      owner_id: ownerId,
      created_by: user?.id,
    }
  }

  async function save() {
    const nextErrors: LoanTransactionValidationErrors = {}
    if (!form.date) nextErrors.date = REQUIRED_FIELD_MESSAGE
    if (!form.lender_id) nextErrors.lender_id = REQUIRED_FIELD_MESSAGE
    if (!form.transaction_type) nextErrors.transaction_type = REQUIRED_FIELD_MESSAGE
    if (Number(form.amount || 0) <= 0) nextErrors.amount = REQUIRED_FIELD_MESSAGE
    if (!form.account_id) nextErrors.account_id = REQUIRED_FIELD_MESSAGE

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: any = buildPayload()
    const { error } = editingId
      ? await supabase.from('loans').update(payload).eq('id', editingId)
      : await supabase.from('loans').insert(payload)
    if (error) return toast.error(error.message)
    toast.success(editingId ? 'Transaction updated' : 'Transaction saved')
    resetForm()
    loadAll()
  }

  async function deleteRecord(record: any) {
    if (!(await confirmAction({
      title: 'Delete Loan Transaction?',
      message: 'Are you sure you want to delete this loan transaction? Deleting this record will automatically adjust and recalculate the current outstanding balance for the linked Bank/Person and the mapped Cash/Bank account.',
      confirmText: 'Yes, Delete',
      cancelText: 'No, Cancel',
    }))) return
    const amounts = transactionAmounts(record)
    addRecycleItem({
      type: 'loanManagement',
      table: 'loans',
      title: loanDisplayName(record) || record.lender_name || '-',
      subtitle: transactionLabel(amounts.type),
      amount: amounts.received || amounts.paid,
      data: record,
    })
    const { error } = await supabase.from('loans').delete().eq('id', record.id)
    if (error) return toast.error(error.message)
    toast.success('Loan transaction deleted successfully.')
    loadAll()
  }

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const date = String(record.date || '')
      if (fromDate && date < fromDate) return false
      if (toDate && date > toDate) return false
      if (filterLenderName && loanDisplayName(record) !== filterLenderName) return false
      return true
    })
  }, [records, fromDate, toDate, filterLenderName])

  const totalReceived = filteredRecords.reduce((s, r) => s + transactionAmounts(r).received, 0)
  const totalPaid = filteredRecords.reduce((s, r) => s + transactionAmounts(r).paid, 0)
  const lenderFilterOptions = useMemo(() => {
    return Array.from(new Set(records.map(record => loanDisplayName(record)).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [records])
  const rangeLabel = fromDate || toDate
    ? `Date range: ${fromDate ? formatDate(fromDate) : 'Start'} to ${toDate ? formatDate(toDate) : 'Today'}`
    : 'Date range: All transactions'
  const lenderLabel = filterLenderName ? `Bank / Person: ${filterLenderName}` : 'Bank / Person: All'

  function clearDateFilter() {
    setFromDate('')
    setToDate('')
    setFilterLenderName('')
  }

  function printTransactions() {
    if (fromDate && toDate && fromDate > toDate) return toast.error('From date cannot be after To date')
    const printWindow = window.open('', '_blank', 'width=1100,height=760')
    if (!printWindow) return toast.error('Please allow popups to print')

    const rows = filteredRecords.map((record, index) => {
      const amounts = transactionAmounts(record)
      const isPayment = amounts.type === 'payment'
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(formatDate(record.date))}</td>
          <td>${escapeHtml(loanDisplayName(record))}</td>
          <td class="${isPayment ? 'payment' : 'receive'}">${isPayment ? 'Payment' : 'Receive'}</td>
          <td>${escapeHtml(record.account_name || '-')}</td>
          <td class="amount receive">${amounts.received ? formatPrintAmount(amounts.received) : '-'}</td>
          <td class="amount payment">${amounts.paid ? formatPrintAmount(amounts.paid) : '-'}</td>
          <td>${escapeHtml(record.notes || '-')}</td>
        </tr>
      `
    }).join('')

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Loan Transactions Print</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 28px; font-family: Arial, sans-serif; color: #0f172a; }
            .header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 16px; }
            h1 { margin: 0; font-size: 22px; }
            .muted { color: #64748b; font-size: 12px; margin-top: 5px; }
            .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
            .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .box-label { color: #64748b; font-size: 12px; }
            .box-value { margin-top: 5px; font-size: 18px; font-weight: 700; }
            .receive { color: #059669; }
            .payment { color: #dc2626; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #f8fafc; color: #475569; text-align: left; border: 1px solid #e2e8f0; padding: 8px; }
            td { border: 1px solid #e2e8f0; padding: 7px 8px; vertical-align: top; }
            .amount { text-align: right; white-space: nowrap; }
            .empty { text-align: center; color: #94a3b8; padding: 24px; }
            @media print {
              body { padding: 18mm; }
              .no-print { display: none; }
              tr { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Loan Transactions</h1>
              <div class="muted">${escapeHtml(rangeLabel)}</div>
              <div class="muted">${escapeHtml(lenderLabel)}</div>
            </div>
            <div class="muted">Generated: ${escapeHtml(new Date().toLocaleDateString('en-US'))}</div>
          </div>
          <div class="summary">
            <div class="box">
              <div class="box-label">Total Receive</div>
              <div class="box-value receive">${formatPrintAmount(totalReceived)}</div>
            </div>
            <div class="box">
              <div class="box-label">Total Payment</div>
              <div class="box-value payment">${formatPrintAmount(totalPaid)}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Bank / Person</th>
                <th>Type</th>
                <th>Account</th>
                <th style="text-align:right">Receive</th>
                <th style="text-align:right">Payment</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td class="empty" colspan="8">No loan transactions found for this date range.</td></tr>'}
            </tbody>
          </table>
          <script>
            window.onload = function () {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="p-6">
      <PageHeader title="Loan Transactions" subtitle="Receive and payment records" actions={<button onClick={() => { setErrors({}); setShowModal(true) }} className="btn-primary"><Plus size={16} /> New Transaction</button>} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card"><p className="text-xs text-slate-500">Receive</p><p className="text-xl font-bold text-brand-green mt-1">{formatCurr(totalReceived)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Payment</p><p className="text-xl font-bold text-brand-red mt-1">{formatCurr(totalPaid)}</p></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-semibold text-slate-800">Transaction List</div>
            <div className="mt-1 text-xs text-slate-500">{rangeLabel}</div>
            <div className="mt-1 text-xs text-slate-500">{lenderLabel}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-48">
              <span className="label">Bank / Person</span>
              <select className="input h-10" value={filterLenderName} onChange={e => setFilterLenderName(e.target.value)}>
                <option value="">All Bank / Person</option>
                {lenderFilterOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="min-w-36">
              <span className="label">From Date</span>
              <input type="date" className="input h-10" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label className="min-w-36">
              <span className="label">To Date</span>
              <input type="date" className="input h-10" value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            {(fromDate || toDate || filterLenderName) && (
              <button type="button" onClick={clearDateFilter} className="btn-secondary h-10 justify-center px-3" title="Clear filters" aria-label="Clear filters">
                <X size={16} />
              </button>
            )}
            <button type="button" onClick={printTransactions} className="btn-primary h-10 justify-center">
              <Printer size={16} /> Print
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4">#</th>
              <th className="text-left py-2 px-4">Date</th>
              <th className="text-left py-2 px-4">Bank / Person</th>
              <th className="text-left py-2 px-4">Type</th>
              <th className="text-left py-2 px-4">Account</th>
              <th className="text-right py-2 px-4">Receive</th>
              <th className="text-right py-2 px-4">Payment</th>
              <th className="text-left py-2 px-4">Notes</th>
              <th className="text-right py-2 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((record, index) => {
              const amounts = transactionAmounts(record)
              const isPayment = amounts.type === 'payment'
              const typeText = isPayment ? 'Payment' : 'Receive'
              return (
                <tr key={record.id} className="table-row">
                  <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                  <td className="py-2.5 px-4">{formatDate(record.date)}</td>
                  <td className="py-2.5 px-4 font-medium">{loanDisplayName(record)}</td>
                  <td className={`py-2.5 px-4 font-medium ${isPayment ? 'text-red-600' : 'text-green-600'}`}>{typeText}</td>
                  <td className="py-2.5 px-4 text-slate-500">{record.account_name || '-'}</td>
                  <td className="py-2.5 px-4 text-right text-brand-green">{amounts.received ? formatCurr(amounts.received) : '-'}</td>
                  <td className="py-2.5 px-4 text-right text-brand-red">{amounts.paid ? formatCurr(amounts.paid) : '-'}</td>
                  <td className="py-2.5 px-4 text-slate-500">{record.notes || '-'}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => editRecord(record)} className="text-slate-400 hover:text-blue-500"><Pencil size={15} /></button>
                      <button onClick={() => deleteRecord(record)} className="text-slate-400 hover:text-brand-red"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filteredRecords.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-slate-400">No loan transactions</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? 'Edit Loan Transaction' : 'New Loan Transaction'}>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); save() }} noValidate>
          <div>
            <label className="label">{requiredLabel('Date')}</label>
            <input
              type="date"
              className={inputClass('date')}
              value={form.date}
              required
              aria-invalid={!!errors.date}
              onChange={e => {
                clearError('date')
                setForm({ ...form, date: e.target.value })
              }}
            />
            {errors.date && <p className="mt-1 text-xs font-medium text-red-600">{errors.date}</p>}
          </div>
          <div>
            <label className="label">{requiredLabel('Bank / Person')}</label>
            <select
              className={inputClass('lender_id')}
              value={form.lender_id}
              required
              aria-invalid={!!errors.lender_id}
              onChange={e => {
                clearError('lender_id')
                setForm({ ...form, lender_id: e.target.value })
              }}
            >
              <option value="">Select Bank / Person</option>
              {lenders.map(lender => <option key={lender.id} value={lender.id}>{lender.name}</option>)}
            </select>
            {errors.lender_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.lender_id}</p>}
          </div>
          <div>
            <label className="label">{requiredLabel('Transaction Type')}</label>
            <select
              className={inputClass('transaction_type')}
              value={form.transaction_type}
              required
              aria-invalid={!!errors.transaction_type}
              onChange={e => {
                clearError('transaction_type')
                setForm({ ...form, transaction_type: e.target.value })
              }}
            >
              <option value="receive">Receive</option>
              <option value="payment">Payment</option>
            </select>
            {errors.transaction_type && <p className="mt-1 text-xs font-medium text-red-600">{errors.transaction_type}</p>}
          </div>
          <div>
            <label className="label">{requiredLabel('Amount')}</label>
            <input
              type="number"
              min="0"
              className={inputClass('amount')}
              value={form.amount || ''}
              required
              aria-invalid={!!errors.amount}
              onChange={e => {
                clearError('amount')
                setForm({ ...form, amount: Number(e.target.value) })
              }}
            />
            {errors.amount && <p className="mt-1 text-xs font-medium text-red-600">{errors.amount}</p>}
          </div>
          <div>
            <label className="label">{requiredLabel('Account')}</label>
            <select
              className={inputClass('account_id')}
              value={form.account_id}
              required
              aria-invalid={!!errors.account_id}
              onChange={e => {
                clearError('account_id')
                setForm({ ...form, account_id: e.target.value })
              }}
            >
              <option value="">Select Account</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            {errors.account_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.account_id}</p>}
          </div>
          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center"><Save size={16} /> {editingId ? 'Update' : 'Save'}</button>
            <button type="button" onClick={resetForm} className="btn-secondary flex-1 justify-center">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
