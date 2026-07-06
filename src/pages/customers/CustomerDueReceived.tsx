import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Filter, Plus, Printer, FileText, Pencil, Trash2, Search, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useReactToPrint } from 'react-to-print'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { addRecycleItem } from '../../lib/recycleBin'

type DueReceivedErrors = Partial<{
  date: string
  customer_id: string
  receiver: string
  discount_category: string
  paymentRows: Record<string, Partial<Record<'account_id' | 'amount', string>>>
}>

const REQUIRED_FIELD_MESSAGE = 'This field is required!'

export default function CustomerDueReceived() {
  const { t, formatCurr } = useLang()
  const { user } = useAuth()
  const [payments, setPayments] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [business, setBusiness] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [expenseCategories, setExpenseCategories] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerOptions, setShowCustomerOptions] = useState(false)
  const [showReceiverOptions, setShowReceiverOptions] = useState(false)
  const [paymentRows, setPaymentRows] = useState([{ id: 'payment-1', account_id: '', amount: 0 }])
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountCategoryId, setDiscountCategoryId] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiverSearch, setReceiverSearch] = useState('')
  const [errors, setErrors] = useState<DueReceivedErrors>({})
  const [printReceipt, setPrintReceipt] = useState<any>(null)
  const customerBoxRef = useRef<HTMLDivElement>(null)
  const receiverBoxRef = useRef<HTMLDivElement>(null)
  const printReceiptRef = useRef<HTMLDivElement>(null)
  const handlePrintReceipt = useReactToPrint({ content: () => printReceiptRef.current })
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    customer_id: '',
    amount: 0,
    account_id: '',
    notes: '',
  })

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (customerBoxRef.current && !customerBoxRef.current.contains(event.target as Node)) {
        setShowCustomerOptions(false)
      }
      if (receiverBoxRef.current && !receiverBoxRef.current.contains(event.target as Node)) {
        setShowReceiverOptions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!printReceipt) return
    const printTimer = window.setTimeout(() => handlePrintReceipt(), 50)
    return () => window.clearTimeout(printTimer)
  }, [printReceipt])

  function resetForm() {
    setEditItem(null)
    setShowModal(false)
    setForm({
      date: new Date().toISOString().split('T')[0],
      customer_id: '',
      amount: 0,
      account_id: '',
      notes: '',
    })
    setPaymentRows([emptyPaymentRow()])
    setDiscountAmount(0)
    setDiscountCategoryId('')
    setReceiverName('')
    setReceiverSearch('')
    setErrors({})
    setCustomerSearch('')
    setShowCustomerOptions(false)
    setShowReceiverOptions(false)
  }

  function openModal(payment?: any) {
    setEditItem(payment || null)
    const selectedCustomer = payment?.customer_id
      ? customers.find(customer => customer.id === payment.customer_id)
      : null
    setForm(payment ? {
      date: payment.date,
      customer_id: payment.customer_id || '',
      amount: Number(payment.amount || 0),
      account_id: payment.account_id || '',
      notes: payment.display_notes ?? displayNotes(payment.notes || ''),
    } : {
      date: new Date().toISOString().split('T')[0],
      customer_id: '',
      amount: 0,
      account_id: '',
      notes: '',
    })
    setPaymentRows(payment ? [{
      id: `${payment.id || Date.now()}-payment`,
      account_id: payment.account_id || '',
      amount: Number(payment.amount || 0),
    }] : [emptyPaymentRow()])
    const editDiscountCategory = payment?.discount_category
      ? expenseCategories.find(category => category.name === payment.discount_category)
      : null
    setDiscountAmount(payment ? Number(payment.discount || 0) : 0)
    setDiscountCategoryId(editDiscountCategory?.id || '')
    const paymentReceiver = payment?.payment_receiver || ''
    setReceiverName(paymentReceiver)
    setReceiverSearch(paymentReceiver)
    setErrors({})
    setCustomerSearch(selectedCustomer ? customerOptionLabel(selectedCustomer) : payment?.customer_name || '')
    setShowCustomerOptions(false)
    setShowReceiverOptions(false)
    setShowModal(true)
  }

  function emptyPaymentRow() {
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, account_id: '', amount: 0 }
  }

  function updatePaymentRow(rowId: string, field: 'account_id' | 'amount', value: string | number) {
    clearPaymentRowError(rowId, field)
    setPaymentRows(current => current.map(row =>
      row.id === rowId ? { ...row, [field]: value } : row
    ))
  }

  function removePaymentRow(rowId: string) {
    setPaymentRows(current => current.length > 1 ? current.filter(row => row.id !== rowId) : current)
  }

  function customerOptionLabel(customer: any) {
    return [customer?.name, customer?.phone].filter(Boolean).join(' - ')
  }

  function selectCustomer(customer: any) {
    clearError('customer_id')
    setForm(current => ({ ...current, customer_id: customer.id }))
    setCustomerSearch(customerOptionLabel(customer))
    setShowCustomerOptions(false)
  }

  function clearCustomer() {
    setForm(current => ({ ...current, customer_id: '' }))
    setCustomerSearch('')
    setShowCustomerOptions(true)
  }

  function selectReceiver(employee: any) {
    const name = employee?.name || ''
    clearError('receiver')
    setReceiverName(name)
    setReceiverSearch([employee?.name, employee?.phone].filter(Boolean).join(' - '))
    setShowReceiverOptions(false)
  }

  function clearReceiver() {
    setReceiverName('')
    setReceiverSearch('')
    setShowReceiverOptions(true)
  }

  function clearError(field: keyof Omit<DueReceivedErrors, 'paymentRows'>) {
    setErrors(current => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function clearPaymentRowError(rowId: string, field: 'account_id' | 'amount') {
    setErrors(current => {
      const rowErrors = current.paymentRows?.[rowId]
      if (!rowErrors?.[field]) return current
      const nextRowErrors = { ...rowErrors }
      delete nextRowErrors[field]
      const nextPaymentRows = { ...(current.paymentRows || {}) }
      if (Object.keys(nextRowErrors).length > 0) nextPaymentRows[rowId] = nextRowErrors
      else delete nextPaymentRows[rowId]
      return {
        ...current,
        paymentRows: Object.keys(nextPaymentRows).length > 0 ? nextPaymentRows : undefined,
      }
    })
  }

  function inputClass(hasError?: boolean, extra = '') {
    return `input ${extra} ${hasError ? 'border-red-500 focus:ring-red-500' : ''}`.trim()
  }

  async function loadAll() {
    const [paymentsRes, customersRes, accountsRes, salesRes, employeesRes, expenseCategoriesRes, expensesRes, businessRes] = await Promise.all([
      supabase.from('customer_payments').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name, phone, opening_due').eq('is_active', true).order('name'),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('sales').select('id, customer_id, net_amount, paid_amount, due_amount').eq('status', 'completed'),
      supabase.from('employees').select('id, name, phone, is_active, resign_date').order('name'),
      supabase.from('expense_categories').select('id, name, color, is_active').eq('is_active', true).order('name'),
      supabase.from('expenses').select('id, date, category_id, category_name, amount, notes, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('business_settings').select('name_bn, name_en, phone, email, address').maybeSingle(),
    ])

    setPayments(paymentsRes.data || [])
    setExpenses(expensesRes.data || [])
    setCustomers(customersRes.data || [])
    setAccounts(accountsRes.data || [])
    setSales(salesRes.data || [])
    setExpenseCategories(expenseCategoriesRes.data || [])
    setBusiness(businessRes.data || null)
    const employeeRows = employeesRes.data || []
    const activeEmployees = employeeRows.filter((employee: any) => employee.is_active !== false && !employee.resign_date)
    const receiverEmployees = activeEmployees.length > 0 ? activeEmployees : employeeRows
    setEmployees(receiverEmployees)
  }

  async function saveDueReceived() {
    const nextErrors: DueReceivedErrors = {}
    const paymentRowErrors: Record<string, Partial<Record<'account_id' | 'amount', string>>> = {}
    const validPaymentRows = paymentRows.filter(row => row.account_id && Number(row.amount || 0) > 0)

    if (!form.date) nextErrors.date = REQUIRED_FIELD_MESSAGE
    if (!form.customer_id) nextErrors.customer_id = REQUIRED_FIELD_MESSAGE
    if (!receiverName.trim()) nextErrors.receiver = REQUIRED_FIELD_MESSAGE

    paymentRows.forEach(row => {
      const rowErrors: Partial<Record<'account_id' | 'amount', string>> = {}
      if (!row.account_id) rowErrors.account_id = REQUIRED_FIELD_MESSAGE
      if (Number(row.amount || 0) <= 0) rowErrors.amount = REQUIRED_FIELD_MESSAGE
      if (Object.keys(rowErrors).length > 0) paymentRowErrors[row.id] = rowErrors
    })

    if (Object.keys(paymentRowErrors).length > 0) nextErrors.paymentRows = paymentRowErrors

    if (Number(discountAmount || 0) > 0 && !discountCategoryId) {
      nextErrors.discount_category = REQUIRED_FIELD_MESSAGE
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return toast.error(t('ledger_fillAllFields'))
    }

    const customer = customers.find(c => c.id === form.customer_id)
    const discountCategory = expenseCategories.find(category => category.id === discountCategoryId)
    const paymentReceiver = receiverName.trim()
    const notes = [
      form.notes.trim(),
      Number(discountAmount || 0) > 0 ? `Discount Amount: ${formatCurr(discountAmount)}` : '',
      Number(discountAmount || 0) > 0 && discountCategory ? `Discount Category: ${discountCategory.name}` : '',
      paymentReceiver ? `Received by: ${paymentReceiver}` : '',
    ].filter(Boolean).join('\n')
    const buildPayload = (row: typeof validPaymentRows[number]) => {
      const account = accounts.find(a => a.id === row.account_id)
      return {
      date: form.date,
      customer_id: form.customer_id,
      customer_name: customer?.name || '',
        amount: Number(row.amount || 0),
        account_id: row.account_id,
      account_name: account?.name || '',
        notes,
      created_by: user?.id,
    }
    }

    const { error } = editItem
      ? await supabase.from('customer_payments').update(buildPayload(validPaymentRows[0])).eq('id', editItem.id)
      : await supabase.from('customer_payments').insert(validPaymentRows.map(buildPayload))

    if (error) return toast.error(error.message || t('common_error'))

    if (Number(discountAmount || 0) > 0 && discountCategory) {
      const expenseAccount = accounts.find(account => account.id === validPaymentRows[0]?.account_id)
      const { error: expenseError } = await supabase.from('expenses').insert({
        date: form.date,
        category_id: discountCategory.id,
        category_name: discountCategory.name,
        amount: Number(discountAmount || 0),
        account_id: expenseAccount?.id || validPaymentRows[0]?.account_id,
        account_name: expenseAccount?.name || '',
        notes: `Automatically generated from Customer Due Discount${customer?.name ? ` - ${customer.name}` : ''}`,
        created_by: user?.id,
      })
      if (expenseError) return toast.error(expenseError.message || 'Due received saved, but discount expense failed')
    }

    toast.success(editItem ? 'Due received updated!' : t('ledger_paymentSaved'))
    resetForm()
    loadAll()
  }

  async function deleteDueReceived(payment: any) {
    if (!(await confirmAction({ message: `Delete due received transaction for ${payment.customer_name}?` }))) return
    const paymentIds = payment.payment_ids || [payment.id]
    addRecycleItem({
      type: 'due',
      title: payment.customer_name || '-',
      subtitle: payment.invoice_no || payment.notes || '-',
      amount: Number(payment.total_received || payment.amount || 0),
      data: payment,
    })
    const { error } = await supabase.from('customer_payments').delete().in('id', paymentIds)
    if (error) return toast.error(error.message || t('common_error'))
    toast.success('Due received deleted!')
    loadAll()
  }

  function parseMetaValue(notes: string, label: string) {
    const line = String(notes || '').split('\n').find(item => item.toLowerCase().startsWith(`${label.toLowerCase()}:`))
    return line ? line.slice(label.length + 1).trim() : ''
  }

  function parseAmountText(value: string) {
    return Number(String(value || '').replace(/[^\d.-]/g, '')) || 0
  }

  function displayNotes(notes: string) {
    return String(notes || '')
      .split('\n')
      .filter(line => {
        const lower = line.toLowerCase()
        return !lower.startsWith('discount amount:') && !lower.startsWith('discount category:') && !lower.startsWith('received by:')
      })
      .join('\n')
      .trim()
  }

  function printDueReceipt(payment: any) {
    setPrintReceipt(payment)
  }

  function formatTk(value: number) {
    return `${Number(value || 0).toLocaleString('en-US')} TK`
  }

  function formatReceiptDate(value: string) {
    if (!value) return '-'
    return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  function receiptNo(payment: any) {
    const year = String(payment?.date || new Date().toISOString()).slice(0, 4)
    const suffix = String(payment?.payment_ids?.[0] || payment?.id || Date.now()).replace(/\D/g, '').slice(-3).padStart(3, '0')
    return `DR-${year}-${suffix}`
  }

  function paymentMethodSummary(payment: any) {
    return (payment?.payment_methods || [])
      .map((method: any) => `${method.account_name || '-'}: ${formatTk(Number(method.amount || 0))}`)
      .join(' | ') || '-'
  }

  function businessContactLine() {
    const parts = [
      business?.phone ? `Phone: ${business.phone}` : '',
      business?.email ? `Email: ${business.email}` : '',
    ].filter(Boolean)
    return parts.join(' | ') || '-'
  }

  const totalReceived = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const customerById = useMemo(() => {
    return customers.reduce((map, customer) => {
      map[customer.id] = customer
      return map
    }, {} as Record<string, any>)
  }, [customers])
  const groupedPayments = useMemo(() => {
    const groups = new Map<string, any>()
    const salesDueByCustomer = sales.reduce((map, sale) => {
      const storedDue = Number(sale.due_amount || 0)
      const fallbackDue = Math.max(0, Number(sale.net_amount || 0) - Number(sale.paid_amount || 0))
      map[sale.customer_id] = (map[sale.customer_id] || 0) + (storedDue || fallbackDue)
      return map
    }, {} as Record<string, number>)

    payments.forEach(payment => {
      const key = [
        payment.date || '',
        payment.customer_id || '',
        payment.notes || '',
        String(payment.created_at || '').slice(0, 19),
      ].join('|')
      const existing = groups.get(key)
      const method = {
        account_name: payment.account_name || '',
        amount: Number(payment.amount || 0),
      }

      if (existing) {
        existing.payment_ids.push(payment.id)
        existing.payment_methods.push(method)
        existing.total_received += method.amount
      } else {
        const notes = payment.notes || ''
        const discount = parseAmountText(parseMetaValue(notes, 'Discount Amount'))
        const customer = customerById[payment.customer_id]
        const expenseMatch = discount > 0
          ? expenses.find(expense =>
              expense.date === payment.date &&
              Number(expense.amount || 0) === discount &&
              String(expense.notes || '').includes(payment.customer_name || '')
            )
          : null
        groups.set(key, {
          ...payment,
          payment_ids: [payment.id],
          payment_methods: [method],
          total_received: method.amount,
          customer_phone: customer?.phone || '',
          discount,
          discount_category: parseMetaValue(notes, 'Discount Category') || expenseMatch?.category_name || '',
          payment_receiver: parseMetaValue(notes, 'Received by'),
          display_notes: displayNotes(notes),
        })
      }
    })

    const groupedRows = Array.from(groups.values()).sort((a, b) => {
      const dateDiff = new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
      if (dateDiff !== 0) return dateDiff
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    })
    const runningDueByCustomer: Record<string, number> = {}

    groupedRows.forEach(row => {
      if (runningDueByCustomer[row.customer_id] == null) {
        runningDueByCustomer[row.customer_id] = Math.max(
          0,
          Number(customerById[row.customer_id]?.opening_due || 0) + Number(salesDueByCustomer[row.customer_id] || 0)
        )
      }
      row.previous_due = runningDueByCustomer[row.customer_id]
      row.current_due = Math.max(0, row.previous_due - Number(row.total_received || 0) - Number(row.discount || 0))
      runningDueByCustomer[row.customer_id] = row.current_due
    })

    return groupedRows.sort((a, b) => {
      const dateDiff = new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      if (dateDiff !== 0) return dateDiff
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    })
  }, [customerById, expenses, payments, sales])
  const selectedCustomer = customers.find(customer => customer.id === form.customer_id)
  const currentPaymentTotal = paymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const selectedCustomerSalesDue = sales
    .filter(sale => sale.customer_id === form.customer_id)
    .reduce((sum, sale) => {
      const storedDue = Number(sale.due_amount || 0)
      const fallbackDue = Math.max(0, Number(sale.net_amount || 0) - Number(sale.paid_amount || 0))
      return sum + (storedDue || fallbackDue)
    }, 0)
  const selectedCustomerPayments = payments
    .filter(payment => payment.customer_id === form.customer_id && payment.id !== editItem?.id)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const previousDue = form.customer_id
    ? Math.max(0, Number(selectedCustomer?.opening_due || 0) + selectedCustomerSalesDue - selectedCustomerPayments)
    : 0
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase()
    const rows = customers.filter(customer => {
      if (!query) return true
      return [customer.name, customer.phone].some(value =>
        String(value || '').toLowerCase().includes(query)
      )
    })
    return rows
  }, [customerSearch, customers])
  const filteredReceivers = useMemo(() => {
    const query = receiverSearch.trim().toLowerCase()
    return employees.filter(employee => {
      if (!query) return true
      return [employee.name, employee.phone].some(value =>
        String(value || '').toLowerCase().includes(query)
      )
    })
  }, [employees, receiverSearch])
  const remainingDueAfterThis = Math.max(0, previousDue - (currentPaymentTotal + Number(discountAmount || 0)))
  const businessName = business?.name_en || business?.name_bn || 'Furniture Management'

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 p-6">
      <PageHeader
        title={t('customers_dueReceived', 'Due received')}
        subtitle={t('customers_dueReceived', 'Due received')}
        actions={
          <button onClick={() => openModal()} className="btn-primary">
            <Plus size={16} /> {t('customers_dueReceived', 'Due received')}
          </button>
        }
      />

      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 border-b border-slate-100 p-4 font-semibold text-slate-800">
          {t('customers_dueReceived', 'Due received')} List
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1500px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="text-left py-2 px-4">#</th>
                <th className="text-left py-2 px-4">Date</th>
                <th className="text-left py-2 px-4">Customer Name</th>
                <th className="text-left py-2 px-4">Customer Phone</th>
                <th className="text-left py-2 px-4">Account 1</th>
                <th className="text-right py-2 px-4">Amount</th>
                <th className="text-left py-2 px-4">Account 2</th>
                <th className="text-right py-2 px-4">Amount</th>
                <th className="text-right py-2 px-4">Total Received</th>
                <th className="text-right py-2 px-4">Discount</th>
                <th className="text-left py-2 px-4">Discount Category</th>
                <th className="text-left py-2 px-4">Payment Receiver</th>
                <th className="text-left py-2 px-4">Notes</th>
                <th className="text-center py-2 px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {groupedPayments.map((payment, index) => (
                <tr key={payment.payment_ids.join('-')} className="table-row">
                  <td className="py-2.5 px-4 font-medium text-slate-500">{index + 1}</td>
                  <td className="py-2.5 px-4">{formatDate(payment.date)}</td>
                  <td className="py-2.5 px-4">
                    <p className="font-medium text-slate-800">{payment.customer_name}</p>
                    {payment.invoice_no && <p className="text-xs text-slate-400">{payment.invoice_no}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">{payment.customer_phone || '-'}</td>
                  <td className="py-2.5 px-4">{payment.payment_methods[0]?.account_name || '-'}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800">
                    {payment.payment_methods[0]?.amount ? formatCurr(payment.payment_methods[0].amount) : '-'}
                  </td>
                  <td className="py-2.5 px-4">{payment.payment_methods[1]?.account_name || '-'}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-800">
                    {payment.payment_methods[1]?.amount ? formatCurr(payment.payment_methods[1].amount) : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-brand-green">{formatCurr(payment.total_received)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-brand-red">
                    {payment.discount ? formatCurr(payment.discount) : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{payment.discount_category || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-600">{payment.payment_receiver || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-500">{payment.display_notes || '-'}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => printDueReceipt(payment)}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        title="Print receipt"
                        aria-label="Print receipt"
                      >
                        <Printer size={15} />
                      </button>
                      <button onClick={() => openModal(payment)} className="text-slate-400 hover:text-blue-500 transition-colors" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => deleteDueReceived(payment)} className="text-slate-400 hover:text-brand-red transition-colors" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {groupedPayments.length === 0 && (
                <tr>
                  <td colSpan={14} className="text-center py-10 text-slate-400">
                    <FileText size={40} className="mx-auto mb-3 opacity-30" />
                    No due received entries
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fixed -left-[10000px] top-0 bg-white text-slate-950">
        <div ref={printReceiptRef} className="invoice-print-page due-receipt-print-page bg-white text-slate-950">
          {printReceipt && (
            <div className="due-receipt-inner">
              <div className="due-receipt-corner due-receipt-corner-tl" />
              <div className="due-receipt-corner due-receipt-corner-tr" />
              <div className="due-receipt-corner due-receipt-corner-bl" />
              <div className="due-receipt-corner due-receipt-corner-br" />

              <div className="due-receipt-header text-center">
                <p className="due-receipt-title">Due Received Receipt</p>
                <h1>{businessName}</h1>
                <p className="due-receipt-contact">{businessContactLine()}</p>
                <p className="due-receipt-address">{business?.address || '-'}</p>
              </div>

              <div className="due-receipt-ornament"><span /></div>

              <div className="due-receipt-meta">
                <div>
                  <span className="due-receipt-icon" />
                  <strong>Date:</strong>
                  <span>{formatReceiptDate(printReceipt.date)}</span>
                </div>
                <div>
                  <span className="due-receipt-icon" />
                  <strong>Receipt No:</strong>
                  <span>{receiptNo(printReceipt)}</span>
                </div>
              </div>

              <div className="due-receipt-customer">
                <div>
                  <span className="due-receipt-icon" />
                  <strong>Customer Name:</strong>
                  <span>{printReceipt.customer_name || '-'}</span>
                </div>
                <div>
                  <span className="due-receipt-icon" />
                  <strong>Customer Phone:</strong>
                  <span>{printReceipt.customer_phone || '-'}</span>
                </div>
              </div>

              <div className="due-receipt-financial">
                <div className="due-receipt-fin-row">
                  <div><span className="due-receipt-icon" /><strong>Previous Due</strong></div>
                  <div>{formatTk(Number(printReceipt.previous_due || 0))}</div>
                </div>
                <div className="due-receipt-fin-row">
                  <div><span className="due-receipt-icon" /><strong>Payment Method & Amount</strong></div>
                  <div>{paymentMethodSummary(printReceipt)}</div>
                </div>
                <div className="due-receipt-fin-row">
                  <div><span className="due-receipt-icon" /><strong>Total Received</strong></div>
                  <div>{formatTk(Number(printReceipt.total_received || 0))}</div>
                </div>
                <div className="due-receipt-fin-row">
                  <div><span className="due-receipt-icon" /><span>Discount</span></div>
                  <div>{formatTk(Number(printReceipt.discount || 0))}</div>
                </div>
                <div className="due-receipt-fin-row due-receipt-current-due">
                  <div><span className="due-receipt-icon" /><strong>Current Due</strong></div>
                  <div>{formatTk(Number(printReceipt.current_due || 0))}</div>
                </div>
              </div>

              <div className="due-receipt-footer">
                <div className="due-receipt-receiver-signature">
                  <p className="due-receipt-receiver-name">{printReceipt.payment_receiver || '-'}</p>
                  <div className="due-receipt-sign-line" />
                  <p className="due-receipt-receiver-label">Payment Receiver</p>
                </div>
                <p className="due-receipt-thanks">Thank you</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editItem ? 'Edit Due received' : t('customers_dueReceived', 'Due received')} size="lg">
        <div className="space-y-5">
          <div>
            <label className="label">{t('ledger_selectCustomer')} <span className="text-brand-red">*</span></label>
            <div ref={customerBoxRef} className="relative">
              <Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                className={inputClass(!!errors.customer_id, 'h-11 rounded-xl border-slate-200 pl-9 pr-16 shadow-sm')}
                value={customerSearch}
                onFocus={() => setShowCustomerOptions(true)}
                onChange={e => {
                  setCustomerSearch(e.target.value)
                  setForm({ ...form, customer_id: '' })
                  clearError('customer_id')
                  setShowCustomerOptions(true)
                }}
                placeholder="Search customer by name or phone..."
                autoComplete="off"
                aria-invalid={!!errors.customer_id}
              />
              <Filter className="absolute right-10 top-1/2 z-10 -translate-y-1/2 text-brand-green" size={16} />
              {customerSearch && (
                <button
                  type="button"
                  onClick={clearCustomer}
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-brand-red"
                  aria-label="Clear customer"
                >
                  <X size={16} />
                </button>
              )}

              {showCustomerOptions && (
                <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map(customer => (
                      <button
                        key={customer.id}
                        type="button"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => selectCustomer(customer)}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-green-50 ${
                          form.customer_id === customer.id ? 'bg-green-50 text-brand-green' : 'text-slate-700'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{customer.name}</span>
                          <span className="block truncate text-xs text-slate-500">{customer.phone || 'No phone number'}</span>
                        </span>
                        {form.customer_id === customer.id && <span className="text-xs font-bold">Selected</span>}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-slate-400">No matching customer found</div>
                  )}
                </div>
              )}
            </div>
            {errors.customer_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.customer_id}</p>}
            <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-brand-red">
              Previous Due: {formatCurr(previousDue)}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">{t('common_date')} <span className="text-brand-red">*</span></label>
              <input
                type="date"
                className={inputClass(!!errors.date, 'h-11 rounded-xl shadow-sm')}
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
              <label className="label">Payment Receiver <span className="text-brand-red">*</span></label>
              <div ref={receiverBoxRef} className="relative">
                <Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  className={inputClass(!!errors.receiver, 'h-11 rounded-xl pl-9 pr-9 shadow-sm')}
                  value={receiverSearch}
                  required
                  aria-invalid={!!errors.receiver}
                  onFocus={() => setShowReceiverOptions(true)}
                  onChange={e => {
                    setReceiverSearch(e.target.value)
                    setReceiverName('')
                    clearError('receiver')
                    setShowReceiverOptions(true)
                  }}
                  placeholder="-- Select Receiver --"
                  autoComplete="off"
                />
                {receiverSearch && (
                  <button
                    type="button"
                    onClick={clearReceiver}
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-brand-red"
                    aria-label="Clear payment receiver"
                  >
                    <X size={16} />
                  </button>
                )}

                {showReceiverOptions && (
                  <div className="absolute z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {filteredReceivers.length > 0 ? (
                      filteredReceivers.map(employee => (
                        <button
                          key={employee.id}
                          type="button"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => selectReceiver(employee)}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-green-50 ${
                            receiverName === employee.name ? 'bg-green-50 text-brand-green' : 'text-slate-700'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{employee.name}</span>
                            <span className="block truncate text-xs text-slate-500">{employee.phone || 'No phone number'}</span>
                          </span>
                          {receiverName === employee.name && <span className="text-xs font-bold">Selected</span>}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-6 text-center text-sm text-slate-400">No matching receiver found</div>
                    )}
                  </div>
                )}
              </div>
              {errors.receiver && <p className="mt-1 text-xs font-medium text-red-600">{errors.receiver}</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">Split Payment / Account</p>
                <p className="text-xs text-slate-500">Add one or more payment methods for this due received.</p>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-green shadow-sm">
                Total {formatCurr(currentPaymentTotal)}
              </div>
            </div>
            <div className="space-y-2">
              {paymentRows.map((row, index) => (
                <div key={row.id} className="grid grid-cols-[32px_1fr_140px_34px] items-end gap-2 rounded-xl bg-white p-2 shadow-sm">
                  <div className="flex h-10 w-8 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-600">
                    {index + 1}
                  </div>
                  <label>
                    <span className="label mb-0.5">Account <span className="text-brand-red">*</span></span>
                    <select
                      className={inputClass(!!errors.paymentRows?.[row.id]?.account_id, 'h-10 rounded-lg py-1 text-xs')}
                      value={row.account_id}
                      onChange={e => updatePaymentRow(row.id, 'account_id', e.target.value)}
                      aria-invalid={!!errors.paymentRows?.[row.id]?.account_id}
                      required
                    >
                      <option value="">Select Account</option>
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                    {errors.paymentRows?.[row.id]?.account_id && <span className="mt-1 block text-xs font-medium text-red-600">{errors.paymentRows?.[row.id]?.account_id}</span>}
                  </label>
                  <label>
                    <span className="label mb-0.5">Amount <span className="text-brand-red">*</span></span>
                    <input
                      type="number"
                      min="0"
                      className={inputClass(!!errors.paymentRows?.[row.id]?.amount, 'h-10 rounded-lg py-1 text-right text-xs')}
                      value={row.amount || ''}
                      placeholder="0"
                      onChange={e => updatePaymentRow(row.id, 'amount', Number(e.target.value))}
                      aria-invalid={!!errors.paymentRows?.[row.id]?.amount}
                      required
                    />
                    {errors.paymentRows?.[row.id]?.amount && <span className="mt-1 block text-xs font-medium text-red-600">{errors.paymentRows?.[row.id]?.amount}</span>}
                  </label>
                  <button
                    type="button"
                    onClick={() => removePaymentRow(row.id)}
                    className="mb-0.5 flex h-10 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-brand-red hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Remove payment method"
                    disabled={paymentRows.length === 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPaymentRows(current => [...current, emptyPaymentRow()])}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 hover:bg-blue-100"
            >
              <Plus size={15} /> Add Payment Method
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Discount Amount</label>
                <input
                  type="number"
                  min="0"
                  className="input h-11 rounded-xl shadow-sm"
                  value={discountAmount || ''}
                  onChange={e => {
                    const nextDiscount = Number(e.target.value)
                    setDiscountAmount(nextDiscount)
                    if (nextDiscount <= 0) {
                      clearError('discount_category')
                      setDiscountCategoryId('')
                    }
                  }}
                  placeholder="0"
                />
              </div>
              {Number(discountAmount || 0) > 0 && (
                <div>
                  <label className="label">Expense Category</label>
                  <select
                    className={inputClass(!!errors.discount_category, 'h-11 rounded-xl shadow-sm')}
                    value={discountCategoryId}
                    onChange={e => {
                      clearError('discount_category')
                      setDiscountCategoryId(e.target.value)
                    }}
                    aria-invalid={!!errors.discount_category}
                  >
                    <option value="">Select Category</option>
                    {expenseCategories.map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                  {errors.discount_category && <p className="mt-1 text-xs font-medium text-red-600">{errors.discount_category}</p>}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">Remaining Due After This</p>
              <p className={`mt-1 text-lg font-bold ${remainingDueAfterThis > 0 ? 'text-brand-red' : 'text-brand-green'}`}>
                {formatCurr(remainingDueAfterThis)}
              </p>
            </div>
          </div>

          <div>
            <label className="label">{t('ledger_notesLabel')}</label>
            <textarea className="input min-h-[92px] rounded-xl shadow-sm" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Add notes for this receipt..." />
          </div>

          <div className="flex flex-col gap-3 pt-1 md:flex-row">
            <button onClick={saveDueReceived} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
              <Printer size={16} /> {editItem ? 'Update & Print Receipt' : 'Save & Print Receipt'}
            </button>
            <button onClick={resetForm} className="btn-secondary h-11 flex-1 justify-center rounded-xl">
              {t('common_cancel')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
