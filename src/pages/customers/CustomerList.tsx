import React, { useState, useEffect, useRef } from 'react'
import { Plus, Save, Search, Trash2, Pencil, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'

type CustomerValidationErrors = Partial<Record<'name' | 'phone', string>>

const REQUIRED_FIELD_MESSAGE = 'This field is required!'
const LINKED_CUSTOMER_DELETE_MESSAGE = 'Cannot Delete Customer: This customer profile contains active transaction or invoice history. You must delete all linked transactions first before removing this customer!'

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1
      row.push(cell)
      if (row.some(value => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some(value => value.trim())) rows.push(row)
  return rows
}

function normalizeCsvHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function parseAmount(value: string) {
  const amount = Number(String(value || '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) ? amount : 0
}

export default function CustomerList() {
  const { t, formatCurr } = useLang()
  const [customers, setCustomers] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', opening_due: 0 })
  const [errors, setErrors] = useState<CustomerValidationErrors>({})
  const [importingCsv, setImportingCsv] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const custRes = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    setCustomers(custRes.data || [])
  }

  function openModal(item?: any) {
    setEditItem(item || null)
    setForm(item ? {
      name: item.name || '',
      phone: item.phone || '',
      email: item.email || '',
      address: item.address || '',
      opening_due: Number(item.opening_due || 0),
    } : { name: '', phone: '', email: '', address: '', opening_due: 0 })
    setErrors({})
    setShowModal(true)
  }

  const inputClass = (field: keyof CustomerValidationErrors) =>
    `input ${errors[field] ? 'border-red-500 focus:ring-red-500' : ''}`

  const clearError = (field: keyof CustomerValidationErrors) => {
    if (!errors[field]) return
    setErrors(current => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function save(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    const nextErrors: CustomerValidationErrors = {}
    const payload = {
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      opening_due: Number(form.opening_due || 0),
    }

    if (!payload.name) nextErrors.name = REQUIRED_FIELD_MESSAGE
    if (!payload.phone) nextErrors.phone = REQUIRED_FIELD_MESSAGE

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (editItem) await supabase.from('customers').update(payload).eq('id', editItem.id)
    else await supabase.from('customers').insert(payload)
    toast.success(t('common_saved'))
    setShowModal(false)
    loadAll()
  }

  async function importCustomersFromCsv(file: File) {
    setImportingCsv(true)

    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length < 2) {
        toast.error('CSV file has no customer rows')
        return
      }

      const headers = rows[0].map(normalizeCsvHeader)
      const indexOf = (...names: string[]) => names.map(normalizeCsvHeader).map(name => headers.indexOf(name)).find(index => index >= 0) ?? -1
      const nameIndex = indexOf('name')
      const phoneIndex = indexOf('phone')
      const emailIndex = indexOf('email')
      const addressIndex = indexOf('address')
      const openingDueIndex = indexOf('opening due', 'openingdue', 'opening due taka')

      if (nameIndex < 0 || phoneIndex < 0) {
        toast.error('CSV must include Name and Phone columns')
        return
      }

      let skipped = 0
      const payload = rows.slice(1).map(row => ({
        name: String(row[nameIndex] || '').trim(),
        phone: String(row[phoneIndex] || '').trim(),
        email: emailIndex >= 0 ? String(row[emailIndex] || '').trim() : '',
        address: addressIndex >= 0 ? String(row[addressIndex] || '').trim() : '',
        opening_due: openingDueIndex >= 0 ? parseAmount(row[openingDueIndex]) : 0,
      })).filter(customer => {
        const valid = Boolean(customer.name && customer.phone)
        if (!valid) skipped += 1
        return valid
      })

      if (payload.length === 0) {
        toast.error('No valid customers found. Name and Phone are required.')
        return
      }

      const { error } = await supabase.from('customers').insert(payload)
      if (error) throw error

      toast.success(`Imported ${payload.length} customer${payload.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}`)
      loadAll()
    } catch (error: any) {
      toast.error(error.message || 'Failed to import customers')
    } finally {
      setImportingCsv(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  async function deleteCustomer(id: string, name: string) {
    if (!(await confirmAction({
      title: 'Delete Customer?',
      message: 'Are you sure you want to permanently delete this customer profile? This will remove the profile record only if no sales or transaction histories are attached.',
      confirmText: 'Yes, Delete',
      cancelText: 'No, Cancel',
    }))) return

    try {
      const [salesRes, paymentRes, splitPaymentRes] = await Promise.all([
        supabase
          .from('sales')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', id),
        supabase
          .from('customer_payments')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', id),
        supabase
          .from('sale_payments')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', id),
      ])

      const countError = salesRes.error || paymentRes.error || splitPaymentRes.error
      if (countError) throw countError

      if (Number(salesRes.count || 0) > 0 || Number(paymentRes.count || 0) > 0 || Number(splitPaymentRes.count || 0) > 0) {
        toast.error(LINKED_CUSTOMER_DELETE_MESSAGE)
        return
      }

      const customer = customers.find(c => c.id === id)
      if (customer) {
        addRecycleItem({
          type: 'customers',
          table: 'customers',
          title: customer.name || '-',
          subtitle: customer.phone || customer.email || '-',
          amount: Number(customer.opening_due || 0),
          data: customer,
        })
      }
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
      toast.success('Customer profile deleted successfully.')
      loadAll()
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message.includes('active transaction or invoice history') || message.includes('foreign key')) {
        toast.error(LINKED_CUSTOMER_DELETE_MESSAGE)
        return
      }
      toast.error(error.message || 'Failed to delete customer')
    }
  }

  const filtered = customers.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search))
  const openingDueTotal = customers.reduce((sum, customer) => sum + Number(customer.opening_due || 0), 0)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <PageHeader
        title={t('customers_listTitle')}
        subtitle={t('customers_listTitle')}
        actions={
          <>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0]
                if (file) importCustomersFromCsv(file)
              }}
            />
            <button type="button" onClick={() => csvInputRef.current?.click()} disabled={importingCsv} className="btn-secondary bg-white disabled:opacity-60 disabled:cursor-not-allowed">
              <Upload size={16} /> {importingCsv ? 'Uploading...' : 'Upload CSV'}
            </button>
            <button onClick={() => openModal()} className="btn-primary"><Plus size={16} /> {t('customers_new')}</button>
          </>
        }
      />

      <div className="mb-6 grid flex-shrink-0 grid-cols-2 gap-4">
        <div className="card"><p className="text-xs text-slate-500">{t('customers_totalCustomers')}</p><p className="text-2xl font-bold mt-1">{customers.length}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('customerDash_openingDue')}</p><p className="text-2xl font-bold text-brand-red mt-1">{formatCurr(openingDueTotal)}</p></div>
      </div>

      <div className="mb-4 flex flex-shrink-0 gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('customers_searchPlaceholder')} className="input pl-9" />
        </div>
      </div>

      <div className="card min-h-0 flex-1 overflow-auto p-0">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4 w-12">#</th>
              <th className="text-left py-2 px-4">{t('customers_colName')}</th>
              <th className="text-left py-2 px-4">{t('customers_colPhone')}</th>
              <th className="text-left py-2 px-4">{t('customers_colAddress')}</th>
              <th className="text-right py-2 px-4">Opening Due</th>
              <th className="text-center py-2 px-4 w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, idx) => (
              <tr key={c.id} className="table-row">
                <td className="py-2.5 px-4 text-slate-500 text-sm font-medium">{idx + 1}</td>
                <td className="py-2.5 px-4 font-medium">{c.name}</td>
                <td className="py-2.5 px-4 text-slate-500">{c.phone || '—'}</td>
                <td className="py-2.5 px-4 text-slate-500">{c.address || '—'}</td>
                <td className="py-2.5 px-4 text-right font-medium">
                  <span className={c.opening_due > 0 ? 'text-brand-red' : 'text-slate-500'}>{formatCurr(c.opening_due || 0)}</span>
                </td>
                <td className="py-2.5 px-4 text-center">
                  <div className="flex gap-2 justify-center">
                    <button onClick={() => openModal(c)} className="text-slate-400 hover:text-blue-500 transition-colors"><Pencil size={16} /></button>
                    <button onClick={() => deleteCustomer(c.id, c.name)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t('customers_noCustomers')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? t('customers_edit') : t('customers_new')}>
        <form className="space-y-3" onSubmit={save} noValidate>
          <div>
            <label className="label" htmlFor="customer-name">{t('customers_nameStar')}</label>
            <input
              id="customer-name"
              className={inputClass('name')}
              value={form.name}
              required
              aria-invalid={!!errors.name}
              onChange={e => {
                clearError('name')
                setForm({ ...form, name: e.target.value })
              }}
            />
            {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label className="label" htmlFor="customer-phone">{t('customers_phoneStar')}</label>
            <input
              id="customer-phone"
              className={inputClass('phone')}
              value={form.phone}
              required
              aria-invalid={!!errors.phone}
              onChange={e => {
                clearError('phone')
                setForm({ ...form, phone: e.target.value })
              }}
            />
            {errors.phone && <p className="mt-1 text-xs font-medium text-red-600">{errors.phone}</p>}
          </div>
          <div><label className="label">{t('common_email')}</label><input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">{t('common_address')}</label><textarea className="input" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div><label className="label">{t('customers_openingDue')}</label><input type="number" min="0" className="input" value={form.opening_due || ''} onChange={e => setForm({ ...form, opening_due: Number(e.target.value) })} /></div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center"><Save size={16} /> {t('common_save')}</button>
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
