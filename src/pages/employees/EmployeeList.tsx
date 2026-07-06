import React, { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, Edit2, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'

type EmployeeActionType = 'Join' | 'Resign'
type EmployeeValidationErrors = Partial<Record<'action_type' | 'employee_id' | 'name' | 'phone' | 'address' | 'join_date' | 'resign_date', string>>
const REQUIRED_FIELD_MESSAGE = 'This field is required!'

function removeMissingColumn(payload: any, error: any) {
  const message = String(error?.message || '')
  const match = message.match(/'([^']+)' column|column "([^"]+)"/i)
  const column = match?.[1] || match?.[2]
  if (!column || !(column in payload)) return payload
  const next = { ...payload }
  delete next[column]
  return next
}

async function saveEmployeePayload(payload: any, editingId?: string | null) {
  const runSave = (nextPayload: any) => editingId
    ? supabase.from('employees').update(nextPayload).eq('id', editingId)
    : supabase.from('employees').insert([nextPayload])

  let activePayload = payload
  let result = await runSave(activePayload)

  for (let attempt = 0; result.error && attempt < 4; attempt += 1) {
    const nextPayload = removeMissingColumn(activePayload, result.error)
    if (nextPayload === activePayload) break
    activePayload = nextPayload
    result = await runSave(activePayload)
  }

  return result
}

export default function EmployeeList() {
  const { t, formatCurr } = useLang()
  const [employees, setEmployees] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<EmployeeActionType>('Join')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [showEmployeeOptions, setShowEmployeeOptions] = useState(false)
  const [errors, setErrors] = useState<EmployeeValidationErrors>({})
  const employeeBoxRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState({
    employee_id: '',
    name: '',
    phone: '',
    address: '',
    join_date: new Date().toISOString().split('T')[0],
    resign_date: '',
    notes: '',
    is_active: true
  })

  useEffect(() => {
    console.log('EmployeeList mounted, loading employees')
    loadEmployees()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (employeeBoxRef.current && !employeeBoxRef.current.contains(event.target as Node)) {
        setShowEmployeeOptions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadEmployees() {
    try {
      console.log('Loading employees...')
      const { data, error } = await supabase.from('employees').select('*').order('join_date', { ascending: false })
      console.log('Load response:', { data, error })

      if (error) {
        console.error('Load error:', error)
        toast.error(error.message)
        return
      }

      console.log('Employees loaded:', data?.length || 0)
      setEmployees(data || [])
    } catch (err: any) {
      console.error('Load catch:', err)
      toast.error('Failed to load employees')
    }
  }

  async function save() {
    if (!validateForm()) return

    try {
      if (actionType === 'Resign') {
        const payload = {
          resign_date: form.resign_date,
          notes: form.notes?.trim() || null,
          is_active: false,
        }
        const { error } = await saveEmployeePayload(payload, form.employee_id)
        if (error) {
          toast.error(`Update failed: ${error.message}`)
          return
        }
        toast.success(t('common_updated'))
        resetForm()
        await loadEmployees()
        return
      }

      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        join_date: form.join_date,
        resign_date: null,
        notes: form.notes?.trim() || null,
        is_active: true
      }

      console.log('Saving with payload:', payload)

      let result
      if (editingId) {
        console.log('Updating employee:', editingId)
        result = await saveEmployeePayload(payload, editingId)
        console.log('Update result:', result)
        if (result.error) {
          console.error('Update error:', result.error)
          toast.error(`Update failed: ${result.error.message}`)
          return
        }
        toast.success(t('common_updated'))
      } else {
        console.log('Inserting new employee')
        result = await saveEmployeePayload(payload)
        console.log('Insert result:', result)
        if (result.error) {
          console.error('Insert error:', result.error)
          toast.error(`Insert failed: ${result.error.message}`)
          return
        }
        toast.success(t('common_created'))
      }

      console.log('Save successful, resetting form')
      setShowModal(false)
      setEditingId(null)
      setActionType('Join')
      setEmployeeSearch('')
      setErrors({})
      setForm({
        employee_id: '',
        name: '',
        phone: '',
        address: '',
        join_date: new Date().toISOString().split('T')[0],
        resign_date: '',
        notes: '',
        is_active: true
      })

      console.log('Reloading employees')
      await loadEmployees()
    } catch (err: any) {
      console.error('Save exception:', err)
      toast.error(err.message || 'An error occurred while saving')
    }
  }

  function editEmployee(emp: any) {
    setEditingId(emp.id)
    setActionType(emp.resign_date || !emp.is_active ? 'Resign' : 'Join')
    setEmployeeSearch(employeeLabel(emp))
    setForm({
      employee_id: emp.id,
      name: emp.name,
      phone: emp.phone || '',
      address: emp.address || '',
      join_date: emp.join_date,
      resign_date: emp.resign_date || '',
      notes: emp.notes || '',
      is_active: emp.is_active
    })
    setShowModal(true)
  }

  async function deleteEmployee(id: string) {
    if (!(await confirmAction({ message: t('common_confirmDelete') }))) return
    try {
      const employee = employees.find(emp => emp.id === id)
      if (employee) {
        addRecycleItem({
          type: 'employees',
          table: 'employees',
          title: employee.name || '-',
          subtitle: employee.phone || employee.join_date || '-',
          amount: 0,
          data: employee,
        })
      }
      const { error } = await supabase.from('employees').delete().eq('id', id)
      if (error) {
        console.error('Delete error:', error)
        toast.error(`Delete failed: ${error.message}`)
        return
      }
      toast.success(t('common_deleted'))
      await loadEmployees()
    } catch (err: any) {
      console.error('Delete catch:', err)
      toast.error('Failed to delete employee')
    }
  }

  function resetForm() {
    console.log('Resetting form')
    setEditingId(null)
    setActionType('Join')
    setEmployeeSearch('')
    setShowEmployeeOptions(false)
    setErrors({})
    setForm({
      employee_id: '',
      name: '',
      phone: '',
      address: '',
      join_date: new Date().toISOString().split('T')[0],
      resign_date: '',
      notes: '',
      is_active: true
    })
    setShowModal(false)
  }

  const activeEmployees = useMemo(() => employees.filter(employee => employee.is_active), [employees])
  const filteredActiveEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase()
    return activeEmployees.filter(employee => {
      if (!query) return true
      return [employee.name, employee.phone].some(value => String(value || '').toLowerCase().includes(query))
    })
  }, [activeEmployees, employeeSearch])

  function employeeLabel(employee: any) {
    return [employee?.name, employee?.phone].filter(Boolean).join(' - ')
  }

  function clearError(field: keyof EmployeeValidationErrors) {
    setErrors(current => {
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

  function inputClass(field: keyof EmployeeValidationErrors, extra = '') {
    return `input ${extra} ${errors[field] ? 'border-red-300 focus:ring-red-400' : ''}`
  }

  function fieldError(field: keyof EmployeeValidationErrors) {
    return errors[field] ? <p className="mt-1 text-xs text-red-600">{errors[field]}</p> : null
  }

  function selectEmployee(employee: any) {
    clearError('employee_id')
    setForm(current => ({
      ...current,
      employee_id: employee.id,
      name: employee.name || '',
      phone: employee.phone || '',
      address: employee.address || '',
      join_date: employee.join_date || current.join_date,
    }))
    setEmployeeSearch(employeeLabel(employee))
    setShowEmployeeOptions(false)
  }

  function clearSelectedEmployee() {
    setForm(current => ({ ...current, employee_id: '', name: '', phone: '', address: '' }))
    setEmployeeSearch('')
    setShowEmployeeOptions(true)
  }

  function handleActionTypeChange(nextActionType: EmployeeActionType) {
    setActionType(nextActionType)
    setErrors({})
    setEmployeeSearch('')
    setShowEmployeeOptions(false)
    setEditingId(null)
    setForm({
      employee_id: '',
      name: '',
      phone: '',
      address: '',
      join_date: new Date().toISOString().split('T')[0],
      resign_date: nextActionType === 'Resign' ? new Date().toISOString().split('T')[0] : '',
      notes: '',
      is_active: nextActionType === 'Join'
    })
  }

  function validateForm() {
    const nextErrors: EmployeeValidationErrors = {}
    if (!actionType) nextErrors.action_type = REQUIRED_FIELD_MESSAGE

    if (actionType === 'Join') {
      if (!form.name.trim()) nextErrors.name = REQUIRED_FIELD_MESSAGE
      if (!form.phone.trim()) nextErrors.phone = REQUIRED_FIELD_MESSAGE
      if (!form.address.trim()) nextErrors.address = REQUIRED_FIELD_MESSAGE
      if (!form.join_date) nextErrors.join_date = REQUIRED_FIELD_MESSAGE
    } else {
      if (!form.employee_id) nextErrors.employee_id = REQUIRED_FIELD_MESSAGE
      if (!form.resign_date) nextErrors.resign_date = REQUIRED_FIELD_MESSAGE
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const activeCount = employees.filter(e => e.is_active).length

  return (
    <div className="p-6">
      <PageHeader title={t('employee_listTitle')} subtitle={t('employee_listSubtitle')}
        actions={<button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} /> {t('employee_addNew')}</button>}
      />

      <div className="mb-4">
        <p className="text-sm text-slate-600">{t('employee_activeCount')}: <span className="font-semibold text-brand-green">{activeCount}</span> / {employees.length}</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4 w-12">#</th>
              <th className="text-left py-2 px-4">{t('common_name')}</th>
              <th className="text-left py-2 px-4">{t('common_phone')}</th>
              <th className="text-left py-2 px-4">{t('common_address')}</th>
              <th className="text-left py-2 px-4">{t('employee_joinDate')}</th>
              <th className="text-left py-2 px-4">{t('employee_resignDate')}</th>
              <th className="text-center py-2 px-4">{t('common_status')}</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, index) => (
              <tr key={emp.id} className={emp.is_active ? 'table-row' : 'table-row opacity-60'}>
                <td className="py-2.5 px-4 text-slate-500">{index + 1}</td>
                <td className="py-2.5 px-4 font-medium">{emp.name}</td>
                <td className="py-2.5 px-4 text-slate-500">{emp.phone || '—'}</td>
                <td className="py-2.5 px-4 text-slate-500">{emp.address || '—'}</td>
                <td className="py-2.5 px-4 text-slate-500">{new Date(emp.join_date).toLocaleDateString()}</td>
                <td className="py-2.5 px-4" style={{ color: emp.resign_date ? '#dc2626' : '#64748b' }}>
                  {emp.resign_date ? new Date(emp.resign_date).toLocaleDateString() : '—'}
                </td>
                <td className="py-2.5 px-4 text-center">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${emp.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {emp.is_active ? t('employee_active') : t('employee_resigned')}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => editEmployee(emp)} className="text-blue-500 hover:text-blue-600"><Edit2 size={14} /></button>
                    <button onClick={() => deleteEmployee(emp.id)} className="text-red-500 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('employee_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? t('employee_editTitle') : t('employee_newTitle')}>
        <div className="space-y-3">
          <div>
            <label className="label">{requiredLabel('Action Type')}</label>
            <select className={inputClass('action_type')} value={actionType} onChange={e => handleActionTypeChange(e.target.value as EmployeeActionType)} required>
              <option value="Join">Join</option>
              <option value="Resign">Resign</option>
            </select>
            {fieldError('action_type')}
          </div>

          {actionType === 'Join' && (
            <>
              <div>
                <label className="label">{requiredLabel(t('common_name'))}</label>
                <input
                  type="text"
                  className={inputClass('name')}
                  value={form.name}
                  onChange={e => {
                    clearError('name')
                    setForm({ ...form, name: e.target.value })
                  }}
                  required
                />
                {fieldError('name')}
              </div>
              <div>
                <label className="label">{requiredLabel(t('common_phone'))}</label>
                <input
                  type="text"
                  className={inputClass('phone')}
                  value={form.phone}
                  onChange={e => {
                    clearError('phone')
                    setForm({ ...form, phone: e.target.value })
                  }}
                  required
                />
                {fieldError('phone')}
              </div>
              <div>
                <label className="label">{requiredLabel(t('common_address'))}</label>
                <input
                  type="text"
                  className={inputClass('address')}
                  value={form.address}
                  onChange={e => {
                    clearError('address')
                    setForm({ ...form, address: e.target.value })
                  }}
                  required
                />
                {fieldError('address')}
              </div>
              <div>
                <label className="label">{requiredLabel(t('employee_joinDate'))}</label>
                <input
                  type="date"
                  className={inputClass('join_date')}
                  value={form.join_date}
                  onChange={e => {
                    clearError('join_date')
                    setForm({ ...form, join_date: e.target.value })
                  }}
                  required
                />
                {fieldError('join_date')}
              </div>
            </>
          )}

          {actionType === 'Resign' && (
            <>
              <div>
                <label className="label">{requiredLabel('Select Employee')}</label>
                <div ref={employeeBoxRef} className="relative">
                  <Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    className={inputClass('employee_id', 'pl-9 pr-16')}
                    value={employeeSearch}
                    onFocus={() => setShowEmployeeOptions(true)}
                    onChange={e => {
                      clearError('employee_id')
                      setEmployeeSearch(e.target.value)
                      setForm(current => ({ ...current, employee_id: '', name: '', phone: '', address: '' }))
                      setShowEmployeeOptions(true)
                    }}
                    placeholder="Search employee name"
                    required
                  />
                  <ChevronDown className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-slate-500" size={16} />
                  {employeeSearch && (
                    <button type="button" onClick={clearSelectedEmployee} className="absolute right-9 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-brand-red">
                      <X size={15} />
                    </button>
                  )}
                  {showEmployeeOptions && (
                    <div className="absolute z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                      {filteredActiveEmployees.map(employee => (
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
                      {filteredActiveEmployees.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-400">No active employee found</div>}
                    </div>
                  )}
                </div>
                {fieldError('employee_id')}
              </div>
              <div>
                <label className="label">{t('common_phone')}</label>
                <input type="text" className="input bg-slate-50 text-slate-500" value={form.phone} disabled readOnly />
              </div>
              <div>
                <label className="label">{t('common_address')}</label>
                <input type="text" className="input bg-slate-50 text-slate-500" value={form.address} disabled readOnly />
              </div>
              <div>
                <label className="label">{requiredLabel(t('employee_resignDate'))}</label>
                <input
                  type="date"
                  className={inputClass('resign_date')}
                  value={form.resign_date}
                  onChange={e => {
                    clearError('resign_date')
                    setForm({ ...form, resign_date: e.target.value })
                  }}
                  required
                />
                {fieldError('resign_date')}
              </div>
            </>
          )}

          <div><label className="label">Note</label><textarea className="input" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center">{t('common_save')}</button>
            <button onClick={resetForm} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
