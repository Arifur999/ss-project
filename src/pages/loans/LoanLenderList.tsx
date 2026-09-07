import React, { useEffect, useState } from 'react'
import { PlusIcon as Plus, FloppyDiskIcon as Save, PencilSimpleIcon as Pencil, TrashIcon as Trash2, BuildingsIcon as Building2, UserCircleIcon as UserCircle } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { confirmAction } from '../../components/ConfirmDialog'
import { deleteStoredLoanLender, isLoanLenderTableMissing, mergeStoredAndLegacyLoanLenders, mergeStoredAndLoanLenders, migrateStoredLoanLenders, saveStoredLoanLender } from './loanFallback'
import { addRecycleItem } from '../../lib/recycleBin'
import { isValidBdPhone, INVALID_PHONE_MESSAGE } from '../../lib/phone'
import { todayISO } from '../../lib/utils'
import { buildLoanAccountSms } from '../../lib/smsTemplates'
import { sendSms } from '../../services/sms.services'
import { NoValue } from '../../components/CellValue'

type LenderValidationErrors = Partial<Record<'name' | 'phone', string>>

const REQUIRED_FIELD_MESSAGE = 'This field is required!'
// Remembered per browser, like the other two SMS switches. Default off: every
// message costs credits, and a shop that texts nobody should not have to turn
// it off on each account.
const SMS_ACCOUNT_KEY = 'loan_account_sms_v1'

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
  const [business, setBusiness] = useState<any>(null)
  const [smsWelcome, setSmsWelcome] = useState(() => localStorage.getItem(SMS_ACCOUNT_KEY) === '1')
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    opening_date: todayISO(),
    opening_balance: 0,
    // 'receivable' = they owe us (stored positive), 'payable' = we owe them
    // (stored negative), 'zero' = nothing outstanding either way.
    opening_balance_direction: 'receivable',
    notes: '',
    is_active: true,
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const ownerId = profile?.owner_id || user?.id
    // The name and helpline the welcome SMS carries. Awaited with the rest
    // rather than raced: a lender saved in the first second after the page
    // opens would otherwise text out the fallback name.
    const businessRes = await supabase.from('business_settings').select('name_bn, name_en, phone').maybeSingle()
    setBusiness(businessRes.data || null)
    const lenderRes = await supabase.from('loan_lenders').select('*').order('created_at', { ascending: false })
    if (isLoanLenderTableMissing(lenderRes.error)) {
      const legacyLoanRes = await supabase.from('loans').select('*').order('created_at', { ascending: false })
      setUsingFallback(true)
      setLenders(mergeStoredAndLegacyLoanLenders(legacyLoanRes.data || []))
      return
    }
    if (lenderRes.error) toast.error(lenderRes.error.message)

    // The table answered, so anything still in this browser from when the
    // fallback was live is a real lender that never reached the server. Push this
    // owner's rows up and re-read. Rows stored against another owner_id are left
    // alone - the storage key is shared across accounts on one browser.
    let lenderRows = lenderRes.data || []
    if (!lenderRes.error) {
      const pushed = await migrateStoredLoanLenders(ownerId)
      if (pushed > 0) {
        const retry = await supabase.from('loan_lenders').select('*').order('created_at', { ascending: false })
        if (!retry.error) lenderRows = retry.data || []
        toast.success(`Moved ${pushed} bank / person saved on this device up to your account`)
      }
    }

    setLenders(mergeStoredAndLoanLenders(lenderRows))
    setUsingFallback(false)
  }

  function openModal(item?: any) {
    setEditItem(item || null)
    setForm(item ? {
      name: item.name || '',
      phone: item.phone || '',
      opening_date: item.opening_date ? String(item.opening_date).slice(0, 10) : todayISO(),
      address: item.address || '',
      opening_balance: Math.abs(Number(item.opening_balance || 0)),
      opening_balance_direction: Number(item.opening_balance || 0) < 0 ? 'payable' : 'receivable',
      notes: item.notes || '',
      is_active: item.is_active !== false,
    } : {
      name: '',
      phone: '',
      address: '',
      opening_date: todayISO(),
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
    setForm({ name: '', phone: '', address: '', opening_date: todayISO(), opening_balance: 0, opening_balance_direction: 'receivable', notes: '', is_active: true })
  }

  /**
   * Text a new account holder the balance it opens on.
   *
   * Only on creation: an edit is bookkeeping, and texting somebody every time
   * their address is corrected would be noise they pay for. Fired after the
   * save, and a failure here never reports the save as failed - the account is
   * on the books either way.
   */
  async function textWelcome(lender: any, principal: number) {
    if (!smsWelcome || editItem) return

    const phone = String(lender?.phone || '').trim()
    if (!isValidBdPhone(phone)) {
      toast.error('Welcome SMS skipped - no valid phone number on this account')
      return
    }

    try {
      await sendSms({
        recipients: [phone],
        message: buildLoanAccountSms({
          // The shop's own name, not the software's: this lands on a customer's
          // phone and they know who they deal with.
          businessName: business?.name_en || business?.name_bn || 'Furnify',
          businessPhone: business?.phone || '',
          customerName: String(lender?.name || '').trim() || 'Customer',
          principal,
        }),
      })
      toast.success('Welcome SMS sent')
    } catch (error: any) {
      toast.error(error?.message || 'Saved, but the welcome SMS could not be sent')
    }
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
    // "Zero balance" means zero whatever was typed in the amount box - it is a
    // statement about the account, not a direction for an amount.
    const openingBalance = form.opening_balance_direction === 'zero' ? 0 : Math.abs(rawOpeningBalance)
    const openingDirection = rawOpeningBalance < 0 ? 'payable' : form.opening_balance_direction
    const name = form.name.trim()
    const phone = form.phone.trim()
    const nextErrors: LenderValidationErrors = {}

    if (!name) nextErrors.name = REQUIRED_FIELD_MESSAGE
    if (!phone) nextErrors.phone = REQUIRED_FIELD_MESSAGE
    else if ((!editItem || phone !== String(editItem.phone || '').trim()) && !isValidBdPhone(phone)) nextErrors.phone = INVALID_PHONE_MESSAGE

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload = {
      ...form,
      name,
      phone,
      address: form.address.trim(),
      notes: form.notes.trim(),
      opening_balance: openingDirection === 'payable' ? -openingBalance : openingBalance,
      opening_date: form.opening_date || null,
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

    // A failure is a failure. This used to divert into localStorage whenever the
    // error text merely mentioned loan_lenders - which covers foreign key
    // violations, validation errors and permission errors - and then show a green
    // "Bank / Person saved". The endpoint exists, so anything going wrong here is
    // something the operator needs to see.
    if (error) return toast.error(error.message || 'Could not save this bank / person')

    // And a response with no row is also a failure, not a reason to write locally.
    // The old code took that branch silently and reported success.
    if (!data) return toast.error('The server did not confirm the save. Please try again.')

    setLenders(current => editItem
      ? current.map(item => item.id === data.id ? data : item)
      : [data, ...current.filter(item => item.id !== data.id)])

    // Before resetForm() clears the name and the amount.
    await textWelcome(data, Number(data.opening_balance || 0))

    toast.success(editItem ? 'Bank / Person updated' : 'Bank / Person saved')
    resetForm()
    loadAll()
  }

  async function lenderHasTransactionHistory(item: any) {
    const checks: any[] = []

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
                      {lender.lender_type === 'bank' ? <Building2 size={16} className="text-slate-600" /> : <UserCircle size={16} className="text-slate-500" />}
                      <div>
                        <p className="font-medium text-slate-800">{lender.name}</p>
                        <p className="text-xs text-slate-400">{lender.address || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">{lender.phone || <NoValue />}</td>
                  <td className={`py-2.5 px-4 text-right font-semibold ${Number(lender.opening_balance || 0) < 0 ? 'text-brand-red' : 'text-brand-green'}`}>
                    {formatCurr(Number(lender.opening_balance || 0))}
                  </td>
                  <td className="py-2.5 px-4">{lender.is_active ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openModal(lender)} className="text-slate-400 hover:text-slate-700"><Pencil size={15} /></button>
                      <button onClick={() => deleteItem(lender)} className="text-slate-400 hover:text-brand-red"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
            ))}
            {lenders.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">No bank/person added</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editItem ? 'Edit Bank / Person' : 'Add Bank / Person'}>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); save() }} noValidate>
          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="label" htmlFor="loan-lender-list-f1">{requiredLabel('Name')}</label>
              {/* Text them the balance their account opens on. Only shown when
                  creating - there is nothing to welcome somebody to on an edit. */}
              {!editItem && (
                <label className="mb-1 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                  <span>Welcome SMS</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={smsWelcome}
                    onClick={() => setSmsWelcome(prev => {
                      localStorage.setItem(SMS_ACCOUNT_KEY, prev ? '0' : '1')
                      return !prev
                    })}
                    className={`relative h-5 w-9 rounded-full transition-colors ${smsWelcome ? 'bg-brand-green' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${smsWelcome ? 'left-[1.125rem]' : 'left-0.5'}`} />
                  </button>
                </label>
              )}
            </div>
            <input id="loan-lender-list-f1"
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
            <label className="label" htmlFor="loan-lender-list-f3">{requiredLabel('Phone')}</label>
            <input id="loan-lender-list-f3"
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
          <div><label className="label" htmlFor="loan-lender-list-f4">Address</label><input id="loan-lender-list-f4" className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div>
            <label className="label" htmlFor="loan-lender-list-f7">Date</label>
            {/* The day this opening balance is as of - the first line of the
                statement. Editable, because an account is often entered days
                after the balance it starts from was agreed. */}
            <input id="loan-lender-list-f7"
              type="date"
              className="input"
              value={form.opening_date}
              onChange={e => setForm({ ...form, opening_date: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="loan-lender-list-f5">Opening Balance</label>
            <div className="grid grid-cols-1 gap-2">
              <input id="loan-lender-list-f5"
                type="number"
                className="input disabled:cursor-not-allowed disabled:bg-neutral-100"
                disabled={form.opening_balance_direction === 'zero'}
                value={form.opening_balance_direction === 'zero' ? '' : (form.opening_balance || '')}
                onChange={e => {
                  const openingBalance = Number(e.target.value)
                  setForm({
                    ...form,
                    opening_balance: openingBalance,
                    opening_balance_direction: openingBalance < 0 ? 'payable' : openingBalance > 0 ? 'receivable' : form.opening_balance_direction,
                  })
                }}
              />
            </div>

            {/* Which way the account leans, said in words rather than by a
                minus sign somebody has to remember to type. Positive is stored
                for "they owe us" and negative for "we owe them", which is the
                convention every loan screen and every SMS reads. */}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { key: 'receivable', label: 'Customer Dena', hint: 'They owe us', dot: 'bg-brand-green' },
                { key: 'payable', label: 'Customer Pawna', hint: 'We owe them', dot: 'bg-brand-red' },
                { key: 'zero', label: 'Zero Balance', hint: 'Nothing outstanding', dot: 'bg-neutral-300' },
              ] as const).map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setForm({ ...form, opening_balance_direction: option.key })}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    form.opening_balance_direction === option.key
                      ? 'border-navy-900 bg-navy-900 text-white'
                      : 'border-neutral-200 bg-white hover:bg-neutral-50'
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <span className={`h-2 w-2 rounded-full ${option.dot}`} />
                    {option.label}
                  </span>
                  <span className={`mt-0.5 block text-[11px] ${
                    form.opening_balance_direction === option.key ? 'text-white/60' : 'text-neutral-500'
                  }`}>
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div><label className="label" htmlFor="loan-lender-list-f6">Notes</label><textarea id="loan-lender-list-f6" className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
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
