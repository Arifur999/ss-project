import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, Edit2, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'

type PaymentType = 'Salary' | 'Bonus'
type SalaryPaymentValidationErrors = Partial<Record<
  'date' | 'employee_id' | 'payment_type' | 'category_id' | 'period_from' | 'period_to' | 'account_id' | 'amount',
  string
>>

const REQUIRED_FIELD_MESSAGE = 'This field is required!'

const defaultPeriod = () => {
  const today = new Date()
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return {
    from: first.toISOString().split('T')[0],
    to: last.toISOString().split('T')[0],
  }
}

function isMissingSalaryDetailsColumn(error: any) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === 'PGRST204' || (
    message.includes('schema cache') &&
    ['employee_name', 'payment_type', 'category_id', 'period_from', 'period_to', 'account_id', 'expense_id'].some(column => message.includes(column))
  )
}

function salaryExpenseMarker(transactionId: string) {
  return `SalaryTransaction:${transactionId}`
}

function employeeLabel(employee: any) {
  return [employee?.name, employee?.phone].filter(Boolean).join(' - ')
}

export default function EmployeeTransactions() {
  const { t, formatCurr } = useLang()
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [showEmployeeOptions, setShowEmployeeOptions] = useState(false)
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState<SalaryPaymentValidationErrors>({})
  const employeeBoxRef = useRef<HTMLDivElement>(null)
  const period = defaultPeriod()
  const [form, setForm] = useState({
    employee_id: '',
    employee_name: '',
    date: new Date().toISOString().split('T')[0],
    payment_type: 'Salary' as PaymentType,
    category_id: '',
    period_from: period.from,
    period_to: period.to,
    account_id: '',
    amount: 0,
    notes: '',
  })

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (employeeBoxRef.current && !employeeBoxRef.current.contains(event.target as Node)) {
        setShowEmployeeOptions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadAll() {
    const [txnRes, empRes, catRes, accRes] = await Promise.all([
      supabase.from('salary_transactions').select('*').order('date', { ascending: false }),
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('expense_categories').select('*').eq('is_active', true).order('name'),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
    ])
    setTransactions(txnRes.data || [])
    setEmployees(empRes.data || [])
    setCategories(catRes.data || [])
    setAccounts(accRes.data || [])
  }

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase()
    return employees.filter(employee => {
      if (!query) return true
      return [employee.name, employee.phone].some(value => String(value || '').toLowerCase().includes(query))
    })
  }, [employeeSearch, employees])

  function selectedEmployee() {
    return employees.find(employee => employee.id === form.employee_id)
  }

  function selectEmployee(employee: any) {
    clearFormError('employee_id')
    setForm(current => ({ ...current, employee_id: employee.id, employee_name: employee.name || '' }))
    setEmployeeSearch(employeeLabel(employee))
    setShowEmployeeOptions(false)
  }

  function clearEmployee() {
    setForm(current => ({ ...current, employee_id: '', employee_name: '' }))
    setEmployeeSearch('')
    setShowEmployeeOptions(true)
  }

  function clearFormError(field: keyof SalaryPaymentValidationErrors) {
    setFormErrors(current => {
      if (!current[field]) return current
      const { [field]: _removed, ...rest } = current
      return rest
    })
  }

  function requiredLabel(label: string) {
    return (
      <>
        {label}<span className="text-red-500"> *</span>
      </>
    )
  }

  function inputClass(field: keyof SalaryPaymentValidationErrors, extra = '') {
    return `input ${extra} ${formErrors[field] ? 'border-red-300 focus:ring-red-400' : ''}`
  }

  function fieldError(field: keyof SalaryPaymentValidationErrors) {
    return formErrors[field] ? <p className="mt-1 text-xs text-red-600">{formErrors[field]}</p> : null
  }

  function validatePaymentForm() {
    const nextErrors: SalaryPaymentValidationErrors = {}
    if (!form.date) nextErrors.date = REQUIRED_FIELD_MESSAGE
    if (!form.employee_id) nextErrors.employee_id = REQUIRED_FIELD_MESSAGE
    if (!form.payment_type) nextErrors.payment_type = REQUIRED_FIELD_MESSAGE
    if (!form.category_id) nextErrors.category_id = REQUIRED_FIELD_MESSAGE
    if (!form.period_from) nextErrors.period_from = REQUIRED_FIELD_MESSAGE
    if (!form.period_to) nextErrors.period_to = REQUIRED_FIELD_MESSAGE
    if (!form.account_id) nextErrors.account_id = REQUIRED_FIELD_MESSAGE
    if (!Number(form.amount || 0)) nextErrors.amount = REQUIRED_FIELD_MESSAGE

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function createOrUpdateExpense(transactionId: string, salaryPayload: any, existingExpenseId?: string) {
    const category = categories.find(category => category.id === salaryPayload.category_id)
    const account = accounts.find(account => account.id === salaryPayload.account_id)
    const marker = salaryExpenseMarker(transactionId)
    const notes = [
      marker,
      `${salaryPayload.payment_type} payment for ${salaryPayload.employee_name}`,
      salaryPayload.period_from && salaryPayload.period_to ? `Period: ${salaryPayload.period_from} to ${salaryPayload.period_to}` : '',
      salaryPayload.notes || '',
    ].filter(Boolean).join('\n')

    const expensePayload = {
      date: salaryPayload.date,
      category_id: salaryPayload.category_id,
      category_name: category?.name || salaryPayload.category_name || '',
      amount: Number(salaryPayload.amount || 0),
      account_id: salaryPayload.account_id,
      account_name: account?.name || salaryPayload.account_name || '',
      notes,
      created_by: user?.id,
    }

    if (existingExpenseId) {
      const { error } = await supabase.from('expenses').update(expensePayload).eq('id', existingExpenseId)
      if (!error) return existingExpenseId
    }

    const { data: existing } = await supabase
      .from('expenses')
      .select('id')
      .ilike('notes', `%${marker}%`)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await supabase.from('expenses').update(expensePayload).eq('id', existing.id)
      if (error) throw error
      return existing.id
    }

    const { data, error } = await supabase.from('expenses').insert(expensePayload).select('id').maybeSingle()
    if (error) throw error
    return data?.id || ''
  }

  async function save() {
    if (!validatePaymentForm()) return

    const employee = selectedEmployee()
    const category = categories.find(category => category.id === form.category_id)
    const account = accounts.find(account => account.id === form.account_id)
    const amount = Number(form.amount || 0)
    const salaryPayload = {
      employee_id: form.employee_id,
      employee_name: employee?.name || form.employee_name || '',
      date: form.date,
      payment_type: form.payment_type,
      category_id: form.category_id,
      category_name: category?.name || '',
      period_from: form.period_from || null,
      period_to: form.period_to || null,
      account_id: form.account_id,
      account_name: account?.name || '',
      amount: form.payment_type === 'Salary' ? amount : 0,
      bonus: form.payment_type === 'Bonus' ? amount : 0,
      notes: form.notes,
    }
    const normalizedSalaryPayload = { ...salaryPayload, amount }

    setSaving(true)
    try {
      let transactionId = editingId
      let expenseId = transactions.find(transaction => transaction.id === editingId)?.expense_id || ''
      const fullPayload = {
        ...salaryPayload,
        amount: salaryPayload.amount,
        bonus: salaryPayload.bonus,
        expense_id: expenseId || null,
      }
      const basePayload = {
        employee_id: salaryPayload.employee_id,
        date: salaryPayload.date,
        amount: salaryPayload.amount,
        bonus: salaryPayload.bonus,
        notes: salaryPayload.notes,
      }

      if (editingId) {
        const result = await supabase.from('salary_transactions').update(fullPayload).eq('id', editingId)
        if (result.error) {
          if (!isMissingSalaryDetailsColumn(result.error)) throw result.error
          const retry = await supabase.from('salary_transactions').update(basePayload).eq('id', editingId)
          if (retry.error) throw retry.error
        }
      } else {
        const result = await supabase.from('salary_transactions').insert({ ...fullPayload, created_by: user?.id }).select('id').maybeSingle()
        if (result.error) {
          if (!isMissingSalaryDetailsColumn(result.error)) throw result.error
          const retry = await supabase.from('salary_transactions').insert({ ...basePayload, created_by: user?.id }).select('id').maybeSingle()
          if (retry.error) throw retry.error
          transactionId = retry.data?.id
        } else {
          transactionId = result.data?.id
        }
      }

      if (!transactionId) throw new Error('Salary transaction was not saved')

      expenseId = await createOrUpdateExpense(transactionId, normalizedSalaryPayload, expenseId)
      await supabase.from('salary_transactions').update({ expense_id: expenseId }).eq('id', transactionId)

      toast.success(editingId ? t('common_updated') : t('common_created'))
      resetForm()
      loadAll()
    } catch (err: any) {
      toast.error(err.message || t('common_error'))
    } finally {
      setSaving(false)
    }
  }

  function editTransaction(txn: any) {
    const emp = employees.find(employee => employee.id === txn.employee_id)
    const paymentType: PaymentType = txn.payment_type || (Number(txn.bonus || 0) > 0 ? 'Bonus' : 'Salary')
    const nextAmount = paymentType === 'Bonus' ? Number(txn.bonus || 0) : Number(txn.amount || 0)
    setEditingId(txn.id)
    setForm({
      employee_id: txn.employee_id,
      employee_name: txn.employee_name || emp?.name || '',
      date: txn.date,
      payment_type: paymentType,
      category_id: txn.category_id || '',
      period_from: txn.period_from || defaultPeriod().from,
      period_to: txn.period_to || defaultPeriod().to,
      account_id: txn.account_id || '',
      amount: nextAmount,
      notes: txn.notes || '',
    })
    setEmployeeSearch(emp ? employeeLabel(emp) : txn.employee_name || '')
    setShowEmployeeOptions(false)
    setShowModal(true)
  }

  async function deleteTransaction(id: string) {
    if (!(await confirmAction({ message: t('common_confirmDelete') }))) return
    const transaction = transactions.find(txn => txn.id === id)
    const employee = employees.find(emp => emp.id === transaction?.employee_id)
    if (transaction) {
      addRecycleItem({
        type: 'employees',
        table: 'salary_transactions',
        title: employee?.name || transaction.employee_name || '-',
        subtitle: transaction.date || '-',
        amount: Number(transaction.amount || 0) + Number(transaction.bonus || 0),
        data: transaction,
      })
    }

    if (transaction?.expense_id) {
      await supabase.from('expenses').delete().eq('id', transaction.expense_id)
    } else {
      await supabase.from('expenses').delete().ilike('notes', `%${salaryExpenseMarker(id)}%`)
    }
    await supabase.from('salary_transactions').delete().eq('id', id)
    toast.success(t('common_deleted'))
    loadAll()
  }

  function resetForm() {
    const nextPeriod = defaultPeriod()
    setEditingId(null)
    setEmployeeSearch('')
    setShowEmployeeOptions(false)
    setFormErrors({})
    setForm({
      employee_id: '',
      employee_name: '',
      date: new Date().toISOString().split('T')[0],
      payment_type: 'Salary',
      category_id: '',
      period_from: nextPeriod.from,
      period_to: nextPeriod.to,
      account_id: '',
      amount: 0,
      notes: '',
    })
    setShowModal(false)
  }

  const employeeById = useMemo(() => {
    return employees.reduce((map, employee) => {
      map[employee.id] = employee
      return map
    }, {} as Record<string, any>)
  }, [employees])

  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      if (employeeFilter && transaction.employee_id !== employeeFilter) return false
      if (fromDate && transaction.date < fromDate) return false
      if (toDate && transaction.date > toDate) return false
      return true
    })
  }, [employeeFilter, fromDate, toDate, transactions])

  const totalSalary = filteredTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
  const totalBonus = filteredTransactions.reduce((sum, transaction) => sum + Number(transaction.bonus || 0), 0)
  const subtotal = totalSalary + totalBonus

  function pdfEscape(value: any) {
    return String(value ?? '-')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E]/g, '?')
  }

  function pdfText(text: string, x: number, y: number, size = 9, bold = false) {
    return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET\n`
  }

  function pdfLine(x1: number, y1: number, x2: number, y2: number) {
    return `0.75 w ${x1} ${y1} m ${x2} ${y2} l S\n`
  }

  function downloadTransactionsPdf() {
    const pageWidth = 842
    const pageHeight = 595
    const margin = 32
    const rowHeight = 20
    const selectedEmployee = employeeFilter ? employeeById[employeeFilter]?.name || 'Selected Employee' : 'All Employees'
    const dateLabel = [fromDate || 'Start', toDate || 'End'].join(' to ')
    const headers = ['#', 'Name', 'Phone', 'Type', 'Salary', 'Bonus', 'Account', 'Note']
    const colX = [margin, 58, 190, 285, 345, 420, 495, 590]
    let y = pageHeight - margin
    let content = ''

    content += pdfText('Salary / Bonus Report', margin, y, 16, true)
    y -= 22
    content += pdfText(`Employee: ${selectedEmployee}`, margin, y, 10)
    content += pdfText(`Date: ${dateLabel}`, 420, y, 10)
    y -= 22
    content += pdfText(`Total Salary: ${formatCurr(totalSalary)}`, margin, y, 10, true)
    content += pdfText(`Total Bonus: ${formatCurr(totalBonus)}`, 230, y, 10, true)
    content += pdfText(`Subtotal: ${formatCurr(subtotal)}`, 430, y, 10, true)
    y -= 18
    content += pdfLine(margin, y, pageWidth - margin, y)
    y -= 17

    headers.forEach((header, index) => {
      content += pdfText(header, colX[index], y, 8, true)
    })
    y -= 8
    content += pdfLine(margin, y, pageWidth - margin, y)
    y -= 15

    filteredTransactions.forEach((txn, index) => {
      if (y < 40) return
      const emp = employeeById[txn.employee_id]
      const paymentType = txn.payment_type || (Number(txn.bonus || 0) > 0 ? 'Bonus' : 'Salary')
      const row = [
        String(index + 1),
        emp?.name || txn.employee_name || txn.employee_id || '-',
        emp?.phone || '-',
        paymentType,
        formatCurr(txn.amount),
        formatCurr(txn.bonus),
        txn.account_name || '-',
        txn.notes || '-',
      ]
      row.forEach((value, cellIndex) => {
        content += pdfText(String(value).slice(0, cellIndex === 7 ? 34 : 18), colX[cellIndex], y, 7)
      })
      y -= rowHeight
    })

    if (filteredTransactions.length === 0) content += pdfText('No records found', margin, y, 10)

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents 4 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    ]
    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((object, index) => {
      offsets.push(pdf.length)
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xrefOffset = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    offsets.slice(1).forEach(offset => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
    })
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

    const blob = new Blob([pdf], { type: 'application/pdf' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'salary-bonus-report.pdf'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="p-6">
      <PageHeader
        title={t('employee_transactionsTitle')}
        subtitle={t('employee_transactionsSubtitle')}
        actions={<button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} /> {t('employee_addTransaction')}</button>}
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card"><p className="text-xs text-slate-500">{t('employee_totalSalary')}</p><p className="text-2xl font-bold text-brand-green mt-1">{formatCurr(totalSalary)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('employee_totalBonus')}</p><p className="text-2xl font-bold text-brand-blue mt-1">{formatCurr(totalBonus)}</p></div>
        <div className="card col-span-2"><p className="text-xs text-slate-500">{t('employee_subtotal')}</p><p className="text-2xl font-bold text-brand-slate mt-1">{formatCurr(subtotal)}</p></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="font-semibold text-slate-800">{t('employee_transactionList')}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[190px_150px_150px_auto]">
            <select className="input h-10" value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}>
              <option value="">All</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
            <input type="date" className="input h-10" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <input type="date" className="input h-10" value={toDate} onChange={e => setToDate(e.target.value)} />
            <button type="button" onClick={downloadTransactionsPdf} className="btn-secondary h-10 justify-center">
              <Download size={15} /> PDF
            </button>
          </div>
        </div>
        <table className="w-full min-w-[980px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4">#</th>
              <th className="text-left py-2 px-4">{t('common_name')}</th>
              <th className="text-left py-2 px-4">{t('common_phone')}</th>
              <th className="text-left py-2 px-4">Type</th>
              <th className="text-right py-2 px-4">{t('employee_salary')}</th>
              <th className="text-right py-2 px-4">{t('employee_bonus')}</th>
              <th className="text-left py-2 px-4">Account</th>
              <th className="text-left py-2 px-4">Note</th>
              <th className="text-right py-2 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((txn, index) => {
              const emp = employeeById[txn.employee_id]
              const paymentType = txn.payment_type || (Number(txn.bonus || 0) > 0 ? 'Bonus' : 'Salary')
              return (
                <tr key={txn.id} className="table-row">
                  <td className="py-2.5 px-4 font-medium text-slate-500">{index + 1}</td>
                  <td className="py-2.5 px-4 font-medium">{emp?.name || txn.employee_name || txn.employee_id}</td>
                  <td className="py-2.5 px-4 text-slate-500">{emp?.phone || '-'}</td>
                  <td className="py-2.5 px-4"><span className={paymentType === 'Bonus' ? 'badge-blue' : 'badge-green'}>{paymentType}</span></td>
                  <td className="py-2.5 px-4 text-right text-brand-green font-medium">{formatCurr(txn.amount)}</td>
                  <td className="py-2.5 px-4 text-right text-brand-blue font-medium">{formatCurr(txn.bonus)}</td>
                  <td className="py-2.5 px-4 text-slate-500">{txn.account_name || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-400 text-xs">{txn.notes}</td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => editTransaction(txn)} className="text-blue-500 hover:text-blue-600"><Edit2 size={14} /></button>
                      <button onClick={() => deleteTransaction(txn.id)} className="text-red-500 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filteredTransactions.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-slate-400">{t('employee_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? t('employee_editTransaction') : 'Create Salary & Bonus Payment'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">{requiredLabel(t('common_date'))}</label>
            <input
              type="date"
              className={inputClass('date', 'h-11')}
              value={form.date}
              onChange={e => {
                clearFormError('date')
                setForm({ ...form, date: e.target.value })
              }}
              required
            />
            {fieldError('date')}
          </div>

          <div>
            <label className="label">{requiredLabel(t('common_name'))}</label>
            <div ref={employeeBoxRef} className="relative">
              <Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={16} />
              <input
                className={inputClass('employee_id', 'h-11 pl-9 pr-16')}
                value={employeeSearch}
                onFocus={() => setShowEmployeeOptions(true)}
                onChange={e => {
                  clearFormError('employee_id')
                  setEmployeeSearch(e.target.value)
                  setForm(current => ({ ...current, employee_id: '', employee_name: e.target.value }))
                  setShowEmployeeOptions(true)
                }}
                placeholder="Search employee name"
                required
              />
              <ChevronDown className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-slate-500" size={16} />
              {employeeSearch && (
                <button type="button" onClick={clearEmployee} className="absolute right-9 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-brand-red">
                  <X size={15} />
                </button>
              )}
              {showEmployeeOptions && (
                <div className="absolute z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                  {filteredEmployees.map(employee => (
                    <button
                      key={employee.id}
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => selectEmployee(employee)}
                      className={`flex w-full flex-col px-3 py-2.5 text-left text-sm hover:bg-green-50 ${form.employee_id === employee.id ? 'bg-green-50 text-brand-green' : 'text-slate-700'}`}
                    >
                      <span className="font-bold">{employee.name}</span>
                      <span className="text-xs text-slate-500">{employee.phone || 'No phone number'}</span>
                    </button>
                  ))}
                  {filteredEmployees.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-400">No employee found</div>}
                </div>
              )}
            </div>
            {fieldError('employee_id')}
          </div>

          <div>
            <label className="label">{requiredLabel('Payment Type')}</label>
            <select
              className={inputClass('payment_type', 'h-11')}
              value={form.payment_type}
              onChange={e => {
                clearFormError('payment_type')
                setForm({ ...form, payment_type: e.target.value as PaymentType })
              }}
              required
            >
              <option value="Salary">Salary</option>
              <option value="Bonus">Bonus</option>
            </select>
            {fieldError('payment_type')}
          </div>

          <div>
            <label className="label">{requiredLabel('Expense Category')}</label>
            <select
              className={inputClass('category_id', 'h-11')}
              value={form.category_id}
              onChange={e => {
                clearFormError('category_id')
                setForm({ ...form, category_id: e.target.value })
              }}
              required
            >
              <option value="">{t('common_select')}</option>
              {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            {fieldError('category_id')}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">{requiredLabel('From Date')}</label>
              <input
                type="date"
                className={inputClass('period_from', 'h-11')}
                value={form.period_from}
                onChange={e => {
                  clearFormError('period_from')
                  setForm({ ...form, period_from: e.target.value })
                }}
                required
              />
              {fieldError('period_from')}
            </div>
            <div>
              <label className="label">{requiredLabel('To Date')}</label>
              <input
                type="date"
                className={inputClass('period_to', 'h-11')}
                value={form.period_to}
                onChange={e => {
                  clearFormError('period_to')
                  setForm({ ...form, period_to: e.target.value })
                }}
                required
              />
              {fieldError('period_to')}
            </div>
          </div>

          <div>
            <label className="label">{requiredLabel('Payment Account')}</label>
            <select
              className={inputClass('account_id', 'h-11')}
              value={form.account_id}
              onChange={e => {
                clearFormError('account_id')
                setForm({ ...form, account_id: e.target.value })
              }}
              required
            >
              <option value="">{t('common_select')}</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            {fieldError('account_id')}
          </div>

          <div>
            <label className="label">{requiredLabel('Amount')}</label>
            <div className="flex">
              <div className={`flex h-11 items-center rounded-l-lg border border-r-0 bg-slate-50 px-4 text-sm font-semibold text-slate-600 ${formErrors.amount ? 'border-red-300' : 'border-slate-200'}`}>TK</div>
              <input
                type="number"
                min="1"
                className={inputClass('amount', 'h-11 rounded-l-none')}
                value={form.amount || ''}
                onChange={e => {
                  clearFormError('amount')
                  setForm({ ...form, amount: Number(e.target.value) })
                }}
                placeholder="0"
                required
              />
            </div>
            {fieldError('amount')}
          </div>

          <div>
            <label className="label">{t('common_notes')}</label>
            <textarea className="input min-h-[92px]" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Write remarks or payment notes..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={resetForm} className="btn-secondary min-w-36 justify-center">{t('common_cancel')}</button>
            <button onClick={save} disabled={saving} className="btn-primary min-w-44 justify-center">
              {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={16} />}
              Save Payment
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
