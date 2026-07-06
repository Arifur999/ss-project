import React, { useState, useEffect, useMemo } from 'react'
import { Edit2, Plus, Printer, Save, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default function SupplierPayments() {
  const { t, formatCurr } = useLang()
  const [payments, setPayments] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const { user } = useAuth()
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    supplier_id: '', supplier_name: '',
    purchase_id: '', purchase_si_no: '',
    amount: 0, account_id: '', account_name: '', notes: ''
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      console.log('Loading supplier payment data...')
      const [payRes, supRes, accRes] = await Promise.all([
        supabase.from('supplier_payments').select('*').order('date', { ascending: false }),
        supabase.from('suppliers').select('id, name').eq('is_active', true),
        supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
      ])

      if (payRes.error) {
        console.error('Payments load error:', payRes.error)
        toast.error(payRes.error.message)
        return
      }

      console.log('Data loaded:', {
        payments: payRes.data?.length || 0,
        suppliers: supRes.data?.length || 0,
        accounts: accRes.data?.length || 0,
      })

      const sortedPayments = [...(payRes.data || [])].sort((a, b) => {
        const dateDiff = new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        if (dateDiff !== 0) return dateDiff
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })

      setPayments(sortedPayments)
      setSuppliers(supRes.data || [])
      setAccounts(accRes.data || [])

      if (supRes.error) console.error('Suppliers error:', supRes.error)
      if (accRes.error) console.error('Accounts error:', accRes.error)
    } catch (err: any) {
      console.error('Load exception:', err)
      toast.error('Failed to load data')
    }
  }

  async function save() {
    if (!form.supplier_id || !form.account_id || !form.amount) {
      toast.error(t('common_fillAllFields'))
      return
    }

    try {
      const sup = suppliers.find(s => s.id === form.supplier_id)
      const acc = accounts.find(a => a.id === form.account_id)

      console.log('Saving supplier payment:', form)

      if (editingId) {
        const { error: updateError } = await supabase.from('supplier_payments').update({
          date: form.date,
          supplier_id: form.supplier_id,
          supplier_name: sup?.name || '',
          purchase_id: form.purchase_id || null,
          purchase_si_no: form.purchase_si_no || '',
          amount: form.amount,
          account_id: form.account_id,
          account_name: acc?.name || '',
          notes: form.notes,
        }).eq('id', editingId)

        if (updateError) {
          console.error('Payment update error:', updateError)
          toast.error(`Update failed: ${updateError.message}`)
          return
        }

        toast.success(t('common_updated'))
        setShowModal(false)
        resetForm()
        await loadAll()
        return
      }

      const { error: payError } = await supabase.from('supplier_payments').insert({
        date: form.date,
        supplier_id: form.supplier_id,
        supplier_name: sup?.name || '',
        purchase_id: form.purchase_id || null,
        purchase_si_no: form.purchase_si_no || '',
        amount: form.amount,
        account_id: form.account_id,
        account_name: acc?.name || '',
        notes: form.notes,
        created_by: user?.id,
      })

      if (payError) {
        console.error('Payment save error:', payError)
        toast.error(`Save failed: ${payError.message}`)
        return
      }

      console.log('Payment saved successfully')
      toast.success(t('supplierPayments_saved'))
      setShowModal(false)
      resetForm()
      await loadAll()
    } catch (err: any) {
      console.error('Save exception:', err)
      toast.error(err.message || 'Failed to save payment')
    }
  }

  function resetForm() {
    setEditingId(null)
    setForm({
      date: new Date().toISOString().split('T')[0],
      supplier_id: '', supplier_name: '',
      purchase_id: '', purchase_si_no: '',
      amount: 0, account_id: '', account_name: '', notes: ''
    })
  }

  function openNewPayment() {
    resetForm()
    setShowModal(true)
  }

  function editPayment(payment: any) {
    setEditingId(payment.id)
    setForm({
      date: payment.date || new Date().toISOString().split('T')[0],
      supplier_id: payment.supplier_id || '',
      supplier_name: payment.supplier_name || '',
      purchase_id: payment.purchase_id || '',
      purchase_si_no: payment.purchase_si_no || '',
      amount: Number(payment.amount || 0),
      account_id: payment.account_id || '',
      account_name: payment.account_name || '',
      notes: payment.notes || '',
    })
    setShowModal(true)
  }

  async function deletePayment(payment: any) {
    if (!(await confirmAction({ message: 'Delete this supplier payment?' }))) return

    const { error } = await supabase
      .from('supplier_payments')
      .delete()
      .eq('id', payment.id)

    if (error) {
      toast.error(error.message || 'Failed to delete payment')
      return
    }

    toast.success('Payment deleted')
    await loadAll()
  }

  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      const date = payment.date || ''
      if (dateFrom && date < dateFrom) return false
      if (dateTo && date > dateTo) return false
      if (supplierFilter && payment.supplier_id !== supplierFilter) return false
      return true
    })
  }, [payments, dateFrom, dateTo, supplierFilter])

  const totalPaid = filteredPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const selectedSupplier = suppliers.find(supplier => supplier.id === supplierFilter)
  const dateRangeLabel = dateFrom || dateTo
    ? `Date range: ${dateFrom ? formatDate(dateFrom) : 'Start'} to ${dateTo ? formatDate(dateTo) : 'Today'}`
    : 'Date range: All transactions'
  const supplierLabel = selectedSupplier ? `Supplier: ${selectedSupplier.name}` : 'Supplier: All'

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setSupplierFilter('')
  }

  function printTransactions() {
    if (dateFrom && dateTo && dateFrom > dateTo) return toast.error('From date cannot be after To date')
    const printWindow = window.open('', '_blank', 'width=1100,height=760')
    if (!printWindow) return toast.error('Please allow popups to print')

    const rows = filteredPayments.map((payment, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatDate(payment.date))}</td>
        <td>${escapeHtml(payment.supplier_name || '-')}</td>
        <td class="amount paid">${escapeHtml(formatCurr(Number(payment.amount || 0)))}</td>
        <td>${escapeHtml(payment.account_name || '-')}</td>
        <td>${escapeHtml(payment.notes || '-')}</td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Supplier Transactions Print</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 28px; font-family: Arial, sans-serif; color: #0f172a; }
            .header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 16px; }
            h1 { margin: 0; font-size: 22px; }
            .muted { color: #64748b; font-size: 12px; margin-top: 5px; }
            .summary { margin: 18px 0; }
            .box { width: 280px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .box-label { color: #64748b; font-size: 12px; }
            .box-value { margin-top: 5px; color: #059669; font-size: 18px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #f8fafc; color: #475569; text-align: left; border: 1px solid #e2e8f0; padding: 8px; }
            td { border: 1px solid #e2e8f0; padding: 7px 8px; vertical-align: top; }
            .amount { text-align: right; white-space: nowrap; }
            .paid { color: #059669; font-weight: 700; }
            .empty { text-align: center; color: #94a3b8; padding: 24px; }
            @media print {
              body { padding: 18mm; }
              tr { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Supplier Transactions</h1>
              <div class="muted">${escapeHtml(dateRangeLabel)}</div>
              <div class="muted">${escapeHtml(supplierLabel)}</div>
            </div>
            <div class="muted">Generated: ${escapeHtml(new Date().toLocaleDateString('en-US'))}</div>
          </div>
          <div class="summary">
            <div class="box">
              <div class="box-label">Total Paid</div>
              <div class="box-value">${escapeHtml(formatCurr(totalPaid))}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Supplier</th>
                <th style="text-align:right">Amount</th>
                <th>Account</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td class="empty" colspan="6">No records found for selected filters.</td></tr>'}
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
      <PageHeader
        title={t('supplierPayments_title')}
        subtitle={t('supplierPayments_title')}
        actions={<button onClick={openNewPayment} className="btn-primary"><Plus size={16} /> {t('supplierPayments_new')}</button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        <div className="card"><p className="text-xs text-slate-500">{t('supplierPayments_totalPaid')}</p><p className="text-2xl font-bold text-brand-green mt-1">{formatCurr(totalPaid)}</p></div>
        <div className="card flex flex-wrap items-end gap-3">
          <label>
            <span className="label">Supplier</span>
            <select className="input min-w-[200px]" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
              <option value="">All Supplier</option>
              {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label>
            <span className="label">From Date</span>
            <input type="date" className="input min-w-[180px]" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </label>
          <label>
            <span className="label">To Date</span>
            <input type="date" className="input min-w-[180px]" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </label>
          <button onClick={clearFilters} className="btn-secondary h-10">Clear</button>
          <button onClick={printTransactions} className="btn-primary h-10"><Printer size={16} /> Print</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">{t('supplierPayments_list')}</div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4 w-12">#</th>
              <th className="text-left py-2 px-4">{t('common_date')}</th>
              <th className="text-left py-2 px-4">{t('common_supplier')}</th>
              <th className="text-right py-2 px-4">{t('common_amount')}</th>
              <th className="text-left py-2 px-4">{t('common_account')}</th>
              <th className="text-left py-2 px-4">{t('common_note')}</th>
              <th className="text-center py-2 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map((p, index) => (
              <tr key={p.id} className="table-row">
                <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                <td className="py-2.5 px-4">{formatDate(p.date)}</td>
                <td className="py-2.5 px-4 font-medium">{p.supplier_name}</td>
                <td className="py-2.5 px-4 text-right font-semibold text-brand-green">{formatCurr(p.amount)}</td>
                <td className="py-2.5 px-4 text-slate-500">{p.account_name}</td>
                <td className="py-2.5 px-4 text-slate-400">{p.notes}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => editPayment(p)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => deletePayment(p)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredPayments.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400">{t('common_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm() }} title={editingId ? 'Edit Supplier Payment' : t('supplierPayments_newTitle')}>
        <div className="space-y-3">
          <div><label className="label">{t('common_date')}</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div>
            <label className="label">{t('common_supplier')}</label>
            <select className="input" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('supplierPayments_amountLabel')}</label><input type="number" min="0" className="input" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div>
            <label className="label">{t('common_account')}</label>
            <select className="input" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('common_note')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {editingId ? 'Update' : t('common_save')}</button>
            <button onClick={() => { setShowModal(false); resetForm() }} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
