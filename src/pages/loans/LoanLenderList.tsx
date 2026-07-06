import React, { useEffect, useState } from 'react'
import { Plus, Save, Pencil, Trash2, Building2, UserCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { confirmAction } from '../../components/ConfirmDialog'
import { deleteStoredLoanLender, isLoanLenderTableMissing, mergeStoredAndLegacyLoanLenders, mergeStoredAndLoanLenders, saveStoredLoanLender } from './loanFallback'
import { addRecycleItem } from '../../lib/recycleBin'

type LenderValidationErrors = Partial<Record<'name' | 'lender_type' | 'phone', string>>

const REQUIRED_FIELD_MESSAGE = 'This field is required!'
const LINKED_LENDER_DELETE_MESSAGE = 'This profile cannot be deleted because they have existing transaction history. Please clear or void the transactions first!'

export default function LoanLenderList() {
  const { formatCurr } = useLang()
  const { user, profile } = useAuth()
  const [lenders, setLenders] = useState<any[]>([])
  const [usingFallback, setUsingFallback] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<LenderValidationErrors>({})
  const [form, setForm] = useState({
    name: '',
    lender_type: '',
    phone: '',
    address: '',
    opening_balance: 0,
    opening_balance_direction: 'receivable',
    notes: '',
    is_active: true,
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const lenderRes = await supabase.from('loan_lenders').select('*').order('created_at', { ascending: false })
    if (isLoanLenderTableMissing(lenderRes.error)) {
      const legacyLoanRes = await supabase.from('loans').select('*').order('created_at', { ascending: false })
      setUsingFallback(true)
      setLenders(mergeStoredAndLegacyLoanLenders(legacyLoanRes.data || []))
      return
    }
    if (lenderRes.error) toast.error(lenderRes.error.message)
    setLenders(mergeStoredAndLoanLenders(lenderRes.data || []))
    setUsingFallback(false)
  }

  function openModal(item?: any) {
    setEditItem(item || null)
    setForm(item ? {
      name: item.name || '',
      lender_type: item.lender_type || '',
      phone: item.phone || '',
      address: item.address || '',
      opening_balance: Math.abs(Number(item.opening_balance || 0)),
      opening_balance_direction: Number(item.opening_balance || 0) < 0 ? 'payable' : 'receivable',
      notes: item.notes || '',
      is_active: item.is_active !== false,
    } : {
      name: '',
      lender_type: '',
      phone: '',
      address: '',
      opening_balance: 0,
      opening_balance_direction: 'receivable',
      notes: '',
      is_active: true,
    })
    setErrors({})
    setShowModal(true)
  }

  function resetForm() {
    setShowModal(false)
    setEditItem(null)
    setErrors({})
    setForm({ name: '', lender_type: '', phone: '', address: '', opening_balance: 0, opening_balance_direction: 'receivable', notes: '', is_active: true })
  }

  const requiredLabel = (label: string) => (
    <>
      {label} <span className="text-brand-red">*</span>
    </>
  )

  const inputClass = (field: keyof LenderValidationErrors) =>
    `input ${errors[field] ? 'border-red-500 focus:ring-red-500' : ''}`

  const clearError = (field: keyof LenderValidationErrors) => {
    if (!errors[field]) return
    setErrors(current => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function normalizeLenderType(value: string) {
    const trimmed = value.trim()
    const lower = trimmed.toLowerCase()
    if (['bank', 'person', 'boss'].includes(lower)) return lower
    return trimmed
  }

  function removeMissingColumn(payload: any, error?: { message?: string } | null) {
    const match = error?.message?.match(/'([^']+)' column|column "([^"]+)"/i)
    const column = match?.[1] || match?.[2]
    if (!column || !(column in payload)) return payload
    const next = { ...payload }
    delete next[column]
    return next
  }

  function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  }

  function isLocalOnlyLender(item: any) {
    const id = String(item?.id || '')
    return !id || id.startsWith('local:') || id.startsWith('legacy:') || !isUuid(id)
  }

  function isValidationSchemaError(error: any) {
    const message = String(error?.message || '').toLowerCase()
    return (
      message.includes('invalid input syntax for type uuid') ||
      message.includes('column') ||
      message.includes('schema cache') ||
      message.includes('relationship') ||
      message.includes('loans')
    )
  }

  async function saveToSupabase(payload: any) {
    const runSave = (nextPayload: any) => editItem
      ? supabase.from('loan_lenders').update(nextPayload).eq('id', editItem.id).select().maybeSingle()
      : supabase.from('loan_lenders').insert(nextPayload).select().maybeSingle()

    let activePayload = payload
    let result = await runSave(activePayload)

    for (let attempt = 0; result.error && attempt < 2; attempt += 1) {
      const nextPayload = removeMissingColumn(activePayload, result.error)
      if (nextPayload === activePayload) break
      activePayload = nextPayload
      result = await runSave(activePayload)
    }

    return result
  }

  async function save() {
    if (saving) return
    const ownerId = profile?.owner_id || user?.id
    const rawOpeningBalance = Number(form.opening_balance || 0)
    const openingBalance = Math.abs(rawOpeningBalance)
    const openingDirection = rawOpeningBalance < 0 ? 'payable' : form.opening_balance_direction
    const name = form.name.trim()
    const lenderType = normalizeLenderType(form.lender_type)
    const phone = form.phone.trim()
    const nextErrors: LenderValidationErrors = {}

    if (!name) nextErrors.name = REQUIRED_FIELD_MESSAGE
    if (!lenderType) nextErrors.lender_type = REQUIRED_FIELD_MESSAGE
    if (!phone) nextErrors.phone = REQUIRED_FIELD_MESSAGE

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload = {
      ...form,
      name,
      lender_type: lenderType,
      phone,
      address: form.address.trim(),
      notes: form.notes.trim(),
      opening_balance: openingDirection === 'payable' ? -openingBalance : openingBalance,
      owner_id: ownerId,
      created_by: user?.id,
    }
    delete (payload as any).opening_balance_direction
    if (usingFallback) {
      const saved = saveStoredLoanLender(payload, editItem)
      setLenders(current => editItem
        ? current.map(item => item.id === saved.id ? saved : item)
        : [saved, ...current])
      toast.success(editItem ? 'Bank / Person updated' : 'Bank / Person saved')
      resetForm()
      loadAll()
      return
    }

    setSaving(true)
    const { data, error } = await saveToSupabase(payload).finally(() => setSaving(false))
    if (isLoanLenderTableMissing(error)) {
      setUsingFallback(true)
      const saved = saveStoredLoanLender(payload, editItem)
      setLenders(current => editItem
        ? current.map(item => item.id === saved.id ? saved : item)
        : [saved, ...current])
      toast.success(editItem ? 'Bank / Person updated' : 'Bank / Person saved')
      resetForm()
      loadAll()
      return
    }
    if (error) return toast.error(error.message)
    if (data) {
      setLenders(current => editItem
        ? current.map(item => item.id === data.id ? data : item)
        : [data, ...current.filter(item => item.id !== data.id)])
    } else {
      const saved = saveStoredLoanLender(payload, editItem)
      setLenders(current => editItem
        ? current.map(item => item.id === saved.id ? saved : item)
        : [saved, ...current])
    }
    toast.success(editItem ? 'Bank / Person updated' : 'Bank / Person saved')
    resetForm()
    loadAll()
  }

  async function lenderHasTransactionHistory(item: any) {
    const checks = []

    if (item.id && isUuid(String(item.id))) {
      checks.push(
        supabase
          .from('loans')
          .select('id', { count: 'exact', head: true })
          .eq('lender_id', item.id)
      )
    }

    if (item.name) {
      checks.push(
        supabase
          .from('loans')
          .select('id', { count: 'exact', head: true })
          .eq('lender_name', item.name)
      )
    }

    const results = await Promise.all(checks)
    for (const result of results) {
      if (result.error) {
        if (isValidationSchemaError(result.error)) {
          console.warn('Skipping lender history validation check', result.error)
          continue
        }
        throw result.error
      }
      if (Number(result.count || 0) > 0) return true
    }

    return false
  }

  async function deleteItem(item: any) {
    if (!(await confirmAction({
      title: 'Delete Bank / Person?',
      message: 'Are you sure you want to delete this profile? This will permanently wipe the record if no histories are attached.',
      confirmText: 'Yes, Delete',
      cancelText: 'No, Cancel',
    }))) return

    try {
      if (await lenderHasTransactionHistory(item)) {
        toast.error(LINKED_LENDER_DELETE_MESSAGE)
        return
      }
    } catch (error: any) {
      if (!isValidationSchemaError(error)) {
        toast.error(error.message || 'Failed to validate transaction history')
        return
      }
      console.warn('Loan lender delete validation skipped', error)
    }

    if (usingFallback || isLocalOnlyLender(item)) {
      deleteStoredLoanLender(item)
      setLenders(current => current.filter(lender => lender.id !== item.id && String(lender.name || '').trim().toLowerCase() !== String(item.name || '').trim().toLowerCase()))
      toast.success('Bank / Person deleted successfully.')
      loadAll()
      return
    }

    addRecycleItem({
      type: 'loanManagement',
      table: usingFallback ? undefined : 'loan_lenders',
      title: item.name || '-',
      subtitle: item.phone || item.lender_type || '-',
      amount: Number(item.opening_balance || 0),
      data: item,
    })
    if (usingFallback) {
      deleteStoredLoanLender(item)
      toast.success('Bank / Person deleted successfully.')
      loadAll()
      return
    }

    const { error } = await supabase.from('loan_lenders').delete().eq('id', item.id)
    if (isLoanLenderTableMissing(error)) {
      setUsingFallback(true)
      deleteStoredLoanLender(item)
      toast.success('Bank / Person deleted successfully.')
      loadAll()
      return
    }
    if (error) {
      const message = String(error.message || '')
      if (message.includes('existing transaction history')) return toast.error(LINKED_LENDER_DELETE_MESSAGE)
      return toast.error(error.message)
    }
    toast.success('Bank / Person deleted successfully.')
    loadAll()
  }

  function lenderTypeLabel(type: string) {
    return type || '-'
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Bank / Person List"
        subtitle="Loan account information"
        actions={<button onClick={() => openModal()} className="btn-primary"><Plus size={16} /> Add Bank / Person</button>}
      />

      <div className="card overflow-x-auto p-0">
        <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">Bank / Person List</div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4 w-12">#</th>
              <th className="text-left py-2 px-4">Name</th>
              <th className="text-left py-2 px-4">Type</th>
              <th className="text-left py-2 px-4">Phone</th>
              <th className="text-right py-2 px-4">Opening Balance</th>
              <th className="text-left py-2 px-4">Status</th>
              <th className="text-right py-2 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {lenders.map((lender, index) => (
                <tr key={lender.id} className="table-row">
                  <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      {lender.lender_type === 'bank' ? <Building2 size={16} className="text-blue-500" /> : <UserCircle size={16} className="text-brand-green" />}
                      <div>
                        <p className="font-medium text-slate-800">{lender.name}</p>
                        <p className="text-xs text-slate-400">{lender.address || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">{lenderTypeLabel(lender.lender_type)}</td>
                  <td className="py-2.5 px-4 text-slate-500">{lender.phone || '-'}</td>
                  <td className={`py-2.5 px-4 text-right font-semibold ${Number(lender.opening_balance || 0) < 0 ? 'text-brand-red' : 'text-brand-green'}`}>
                    {formatCurr(Number(lender.opening_balance || 0))}
                  </td>
                  <td className="py-2.5 px-4">{lender.is_active ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openModal(lender)} className="text-slate-400 hover:text-blue-500"><Pencil size={15} /></button>
                      <button onClick={() => deleteItem(lender)} className="text-slate-400 hover:text-brand-red"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
            ))}
            {lenders.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400">No bank/person added</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editItem ? 'Edit Bank / Person' : 'Add Bank / Person'}>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); save() }} noValidate>
          <div>
            <label className="label">{requiredLabel('Name')}</label>
            <input
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
            <label className="label">{requiredLabel('Type')}</label>
            <input
              className={inputClass('lender_type')}
              value={form.lender_type}
              required
              aria-invalid={!!errors.lender_type}
              onChange={e => {
                clearError('lender_type')
                setForm({ ...form, lender_type: e.target.value })
              }}
              placeholder="Type manually"
            />
            {errors.lender_type && <p className="mt-1 text-xs font-medium text-red-600">{errors.lender_type}</p>}
          </div>
          <div>
            <label className="label">{requiredLabel('Phone')}</label>
            <input
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
          <div><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div>
            <label className="label">Opening Balance</label>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
              <input
                type="number"
                className="input"
                value={form.opening_balance || ''}
                onChange={e => {
                  const openingBalance = Number(e.target.value)
                  setForm({
                    ...form,
                    opening_balance: openingBalance,
                    opening_balance_direction: openingBalance < 0 ? 'payable' : openingBalance > 0 ? 'receivable' : form.opening_balance_direction,
                  })
                }}
              />
              <select className="input" value={form.opening_balance_direction} onChange={e => setForm({ ...form, opening_balance_direction: e.target.value })}>
                <option value="receivable">Ami pabo</option>
                <option value="payable">Ami debo</option>
              </select>
            </div>
          </div>
          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-60 disabled:cursor-not-allowed"><Save size={16} /> {saving ? 'Saving...' : editItem ? 'Update' : 'Save'}</button>
            <button type="button" onClick={resetForm} className="btn-secondary flex-1 justify-center">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
