import React, { useState, useEffect } from 'react'
import { Save, Plus, Trash2, Building2, Users, CreditCard, Target, Truck, UserCog, Eye, EyeOff, ShieldCheck, ShieldX, Pencil, Camera, Crown, Briefcase, Package, Calculator, ShoppingCart, UserRoundPlus, BarChart3, Cog, Check, X, CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { rememberBusinessBrand, resolveBusinessName } from '../lib/businessBrand'

type Tab = 'business' | 'shareholders' | 'accounts' | 'suppliers' | 'targets' | 'users'
const SHAREHOLDER_OPENING_AMOUNT_FALLBACK_KEY = 'shareholder_opening_amount_fallback_v1'
const REQUIRED_FIELD_MESSAGE = 'This field is required!'

type BusinessValidationErrors = Partial<Record<'businessName' | 'phone1' | 'address', string>>
type ShareholderValidationErrors = Partial<Record<'name' | 'phone', string>>

function readShareholderOpeningAmountFallback() {
  try {
    return JSON.parse(localStorage.getItem(SHAREHOLDER_OPENING_AMOUNT_FALLBACK_KEY) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function saveShareholderOpeningAmountFallback(shareholderId: string, amount: number) {
  if (!shareholderId) return
  const current = readShareholderOpeningAmountFallback()
  localStorage.setItem(SHAREHOLDER_OPENING_AMOUNT_FALLBACK_KEY, JSON.stringify({
    ...current,
    [shareholderId]: Number(amount || 0),
  }))
}

function isMissingOpeningAmountColumn(error: any) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('opening_amount') && (
    message.includes('schema cache') ||
    message.includes('column') ||
    error?.code === 'PGRST204'
  )
}

export default function Settings() {
  const { t, formatCurr, monthName } = useLang()
  const [activeTab, setActiveTab] = useState<Tab>('business')
  const [business, setBusiness] = useState({ name_bn: '', name_en: '', phone: '', email: '', address: '', website: '', trade_license: '', logo_url: '' })
  const [businessEditable, setBusinessEditable] = useState(true)
  const [businessErrors, setBusinessErrors] = useState<BusinessValidationErrors>({})
  const [shareholders, setShareholders] = useState<any[]>([])
  const [investments, setInvestments] = useState<any[]>([])
  const [profitWithdrawals, setProfitWithdrawals] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [targets, setTargets] = useState<any[]>([])
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [editTarget, setEditTarget] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<any>(null)
  const [modalType, setModalType] = useState('')
  const [editItem, setEditItem] = useState<any>(null)
  const currentYear = new Date().getFullYear()
  const { profile: currentProfile } = useAuth()

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (activeTab === 'users') loadUsers() }, [activeTab])

  async function callManageUsers(action: string, init?: RequestInit) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not signed in')

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users/${action}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      }
    )

    if (!res.ok) throw new Error(`User function unavailable (${res.status})`)
    return res.json()
  }

  async function loadUsersFromProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, is_active, created_at')
      .in('role', ['owner', 'manager', 'sales_staff', 'accountant'])
      .order('created_at', { ascending: true })

    if (error) throw error
    setUsers(data || [])
  }

  async function loadTargets() {
    const { data, error } = await supabase
      .from('monthly_targets')
      .select('id, month, year, sales_target, profit_target, created_at, updated_at')
      .order('year', { ascending: false })
      .order('month', { ascending: true })

    if (error) throw error
    return data || []
  }

  async function loadAll() {
    const [bizRes, shRes, accRes, supRes, targetRows, invRes, profitWithdrawRes] = await Promise.all([
      supabase.from('business_settings').select('*').maybeSingle(),
      supabase.from('shareholders').select('*').order('sort_order'),
      supabase.from('accounts').select('*').order('sort_order'),
      supabase.from('suppliers').select('*'),
      loadTargets().catch(error => {
        console.error('Error loading targets:', error)
        toast.error('Error loading targets: ' + (error.message || 'Unknown error'))
        return []
      }),
      supabase.from('investments').select('*'),
      supabase.from('profit_withdrawals').select('id, shareholder_id, shareholder_name, amount, date'),
    ])
    if (bizRes.data) {
      setBusiness(bizRes.data)
      rememberBusinessBrand(bizRes.data)
      setBusinessEditable(false)
    }
    const openingAmountFallback = readShareholderOpeningAmountFallback()
    setShareholders((shRes.data || []).map((shareholder: any) => ({
      ...shareholder,
      opening_amount: Number(shareholder.opening_amount ?? openingAmountFallback[shareholder.id] ?? 0),
    })))
    setAccounts(accRes.data || [])
    setSuppliers(supRes.data || [])
    setTargets(targetRows)
    setInvestments(invRes.data || [])
    setProfitWithdrawals(profitWithdrawRes.data || [])
  }

  async function loadUsers() {
    setUsersLoading(true)
    try {
      const json = await callManageUsers('list')
      if (json.users) {
        setUsers(json.users)
      } else {
        await loadUsersFromProfiles()
      }
    } catch {
      try {
        await loadUsersFromProfiles()
      } catch {
        toast.error(t('settings_failedLoadUsers'))
      }
    } finally {
      setUsersLoading(false)
    }
  }

  async function updateUserRole(userId: string, role: string) {
    try {
      const json = await callManageUsers('update', {
        method: 'PUT',
        body: JSON.stringify({ user_id: userId, role }),
      })
      if (!json.success) throw new Error(json.error || t('common_error'))
    } catch {
      const { error } = await supabase
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', userId)
      if (error) return toast.error(error.message || t('common_error'))
    }

    toast.success(t('settings_roleUpdated'))
    loadUsers()
  }

  async function toggleUserActive(userId: string, is_active: boolean) {
    try {
      await callManageUsers('update', {
        method: 'PUT',
        body: JSON.stringify({ user_id: userId, is_active }),
      })
    } catch {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', userId)
      if (error) return toast.error(error.message || t('common_error'))
    }
    loadUsers()
  }

  async function deleteUser(userId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users/delete`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      }
    )
    const json = await res.json()
    if (json.success) { toast.success(t('common_deleted')); setShowDeleteConfirm(null); loadUsers() }
    else toast.error(json.error || t('common_error'))
  }

  async function saveBusiness() {
    const businessName = (business.name_en || business.name_bn || '').trim()
    const [phone1Raw, phone2Raw] = getBusinessPhones()
    const phone1 = phone1Raw.trim()
    const phone2 = phone2Raw.trim()
    const address = (business.address || '').trim()
    const nextErrors: BusinessValidationErrors = {}

    if (!businessName) nextErrors.businessName = REQUIRED_FIELD_MESSAGE
    if (!phone1) nextErrors.phone1 = REQUIRED_FIELD_MESSAGE
    if (!address) nextErrors.address = REQUIRED_FIELD_MESSAGE

    setBusinessErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload = {
      ...business,
      name_bn: businessName,
      name_en: businessName,
      address,
      phone: [phone1, phone2].filter(Boolean).join(', '),
      trade_license: '',
    }
    const { data } = await supabase.from('business_settings').select('id').maybeSingle()
    let saveError: { message?: string } | null = null
    if (data?.id) {
      const { error } = await supabase.from('business_settings').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', data.id)
      saveError = error
    } else {
      const { error } = await supabase.from('business_settings').insert(payload)
      saveError = error
    }

    if (saveError) {
      toast.error(saveError.message || t('common_error'))
      return
    }

    setBusiness(payload)
    rememberBusinessBrand(payload)
    setBusinessEditable(false)
    toast.success(t('common_saved'))
  }

  function clearBusinessError(field: keyof BusinessValidationErrors) {
    setBusinessErrors(current => {
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

  function requiredInputClass(hasError: boolean) {
    return `input ${hasError ? 'border-red-300 focus:ring-red-400' : ''}`
  }

  function handleLogoUpload(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setBusiness(prev => ({ ...prev, logo_url: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)
  }

  function getBusinessPhones() {
    const phones = (business.phone || '').split(',').map(phone => phone.trim())
    return [phones[0] || '', phones.slice(1).join(', ') || '']
  }

  function setBusinessPhone(index: 0 | 1, value: string) {
    const [phone1, phone2] = getBusinessPhones()
    const nextPhones = index === 0 ? [value, phone2] : [phone1, value]
    setBusiness({ ...business, phone: nextPhones.filter(Boolean).join(', ') })
  }

  async function deleteTarget(id: string) {
    await supabase.from('monthly_targets').delete().eq('id', id)
    toast.success(t('common_deleted'))
    setTargets(await loadTargets())
  }

  async function toggleAccount(id: string, is_active: boolean) {
    await supabase.from('accounts').update({ is_active }).eq('id', id)
    loadAll()
  }

  function openModal(type: string, item?: any) {
    setModalType(type)
    setEditItem(item || null)
    setShowModal(true)
  }

  function shareholderCapital(shareholder: any) {
    const investAmount = investments
      .filter(record => record.shareholder_id === shareholder.id)
      .reduce((sum, record) => sum + Number(record.invest_amount || 0), 0)
    const withdrawAmount = investments
      .filter(record => record.shareholder_id === shareholder.id)
      .reduce((sum, record) => sum + Number(record.withdraw_amount || 0), 0)
    const profitWithdrawalAmount = profitWithdrawals
      .filter(record => record.shareholder_id === shareholder.id || (!record.shareholder_id && record.shareholder_name === shareholder.name))
      .reduce((sum, record) => sum + Number(record.amount || 0), 0)
    const openingAmount = Number(shareholder.opening_amount || 0)

    return {
      openingAmount,
      investAmount,
      withdrawAmount,
      profitWithdrawalAmount,
      netAmount: openingAmount + investAmount - withdrawAmount,
    }
  }

  const totalShareCapital = shareholders.reduce((sum, shareholder) => sum + shareholderCapital(shareholder).netAmount, 0)
  const totalSharePercent = totalShareCapital > 0 ? 100 : 0

  const tabs = [
    { id: 'business', label: t('settings_tabBusiness'), icon: <Building2 size={16} /> },
    { id: 'shareholders', label: t('settings_tabShareholders'), icon: <Users size={16} /> },
    { id: 'accounts', label: t('settings_tabAccounts'), icon: <CreditCard size={16} /> },
    { id: 'suppliers', label: t('settings_tabSuppliers'), icon: <Truck size={16} /> },
    { id: 'targets', label: t('settings_tabTargets'), icon: <Target size={16} /> },
    { id: 'users', label: t('settings_tabUsers'), icon: <UserCog size={16} /> },
  ]

  const ROLE_LABELS: Record<string, string> = {
    owner: t('settings_roleOwner'),
    manager: t('settings_roleManager'),
    sales_staff: t('settings_roleSalesStaff'),
    accountant: t('settings_roleAccountant'),
  }

  return (
    <div className="p-6">
      <PageHeader title={t('settings_title')} subtitle={t('settings_subtitle')} />

      <div className="flex gap-6">
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1">
          {activeTab === 'business' && (
            <div className="card">
              <h2 className="font-semibold text-slate-800 mb-4">{t('settings_tabBusiness')}</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">{requiredLabel(t('settings_businessName'))}</label>
                  <input
                    type="text"
                    value={business.name_en || business.name_bn || ''}
                    onChange={e => {
                      clearBusinessError('businessName')
                      setBusiness({ ...business, name_bn: e.target.value, name_en: e.target.value })
                    }}
                    className={requiredInputClass(Boolean(businessErrors.businessName))}
                    disabled={!businessEditable}
                    required
                  />
                  {businessErrors.businessName && <p className="mt-1 text-xs text-red-600">{businessErrors.businessName}</p>}
                </div>
                <div>
                  <label className="label">{requiredLabel(t('settings_businessPhone1'))}</label>
                  <input
                    type="text"
                    value={getBusinessPhones()[0]}
                    onChange={e => {
                      clearBusinessError('phone1')
                      setBusinessPhone(0, e.target.value)
                    }}
                    className={requiredInputClass(Boolean(businessErrors.phone1))}
                    disabled={!businessEditable}
                    required
                  />
                  {businessErrors.phone1 && <p className="mt-1 text-xs text-red-600">{businessErrors.phone1}</p>}
                </div>
                <div>
                  <label className="label">{t('settings_businessPhone2')}</label>
                  <input
                    type="text"
                    value={getBusinessPhones()[1]}
                    onChange={e => setBusinessPhone(1, e.target.value)}
                    className="input"
                    disabled={!businessEditable}
                  />
                </div>
                <div>
                  <label className="label">{t('settings_businessEmail')}</label>
                  <input
                    type="email"
                    value={business.email || ''}
                    onChange={e => setBusiness({ ...business, email: e.target.value })}
                    className="input"
                    disabled={!businessEditable}
                  />
                </div>
                <div className="col-span-2">
                  <label className="label">{requiredLabel(t('settings_businessAddress'))}</label>
                  <input
                    type="text"
                    value={business.address}
                    onChange={e => {
                      clearBusinessError('address')
                      setBusiness({ ...business, address: e.target.value })
                    }}
                    className={requiredInputClass(Boolean(businessErrors.address))}
                    disabled={!businessEditable}
                    required
                  />
                  {businessErrors.address && <p className="mt-1 text-xs text-red-600">{businessErrors.address}</p>}
                </div>
                <div>
                  <label className="label">{t('settings_businessWebsite')}</label>
                  <input
                    type="text"
                    value={business.website || ''}
                    onChange={e => setBusiness({ ...business, website: e.target.value })}
                    className="input"
                    disabled={!businessEditable}
                  />
                </div>
                <div>
                  <label className="label">{t('settings_businessLogoUrl')}</label>
                  <input type="text" value={business.logo_url} onChange={e => setBusiness({ ...business, logo_url: e.target.value })} className="input" placeholder={t('settings_businessLogoPlaceholder')} disabled={!businessEditable} />
                </div>
                <div>
                  <label className="label">{t('settings_businessUploadLogo')}</label>
                  <input type="file" accept="image/*" onChange={e => handleLogoUpload(e.target.files?.[0])} className="input" disabled={!businessEditable} />
                </div>
                {business.logo_url && (
                  <div className="col-span-3">
                    <img src={business.logo_url} alt="Business logo preview" className="h-20 max-w-48 object-contain border border-slate-200 rounded-lg bg-white p-2" />
                  </div>
                )}
                <div className="col-span-3 flex items-center gap-3">
                  <button onClick={saveBusiness} className="btn-primary" disabled={!businessEditable}>
                    <Save size={16} /> {t('common_save')}
                  </button>
                  <button onClick={() => setBusinessEditable(true)} className="btn-secondary" type="button">
                    <Pencil size={16} /> Edit
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'shareholders' && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-slate-800">{t('settings_shareholderList')}</h2>
                  <p className="text-xs text-slate-500">{t('settings_totalShare')} {totalSharePercent.toFixed(1)}%</p>
                </div>
                <button onClick={() => openModal('shareholder')} className="btn-primary">
                  <Plus size={16} /> {t('common_add')}
                </button>
              </div>
              <div className="w-full overflow-x-auto rounded-lg shadow-sm">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="table-header">
                    <tr>
                      <th className="text-left py-2 px-3 w-12">#</th>
                      <th className="text-left py-2 px-3">{t('common_name')}</th>
                      <th className="text-left py-2 px-3">{t('common_phone')}</th>
                      <th className="text-left py-2 px-3">{t('common_address')}</th>
                      <th className="text-right py-2 px-3">{t('invest_openingAmount')}</th>
                      <th className="text-right py-2 px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shareholders.map((sh, index) => {
                      const openingAmount = Number(sh.opening_amount || 0)
                      return (
                        <tr key={sh.id} className="table-row">
                          <td className="py-2 px-3 text-slate-500">{index + 1}</td>
                          <td className="py-2 px-3 font-medium">{sh.name}</td>
                          <td className="py-2 px-3 text-slate-500">{sh.phone || '-'}</td>
                          <td className="py-2 px-3 text-slate-500">{sh.address || '-'}</td>
                          <td className="py-2 px-3 text-right text-slate-500">{formatCurr(openingAmount)}</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => openModal('shareholder', sh)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Pencil size={13} /></button>
                              <button onClick={async () => { await supabase.from('shareholders').delete().eq('id', sh.id); loadAll() }} className="p-1 text-slate-400 hover:text-brand-red hover:bg-red-50 rounded transition-colors"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="card p-0">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">{t('settings_tabAccounts')}</h2>
                <button onClick={() => openModal('account')} className="btn-primary"><Plus size={16} /> {t('common_add')}</button>
              </div>
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="text-left py-2 px-4">{t('common_name')}</th>
                    <th className="text-right py-2 px-4">{t('settings_openingBalance')}</th>
                    <th className="text-center py-2 px-4">{t('common_active')}</th>
                    <th className="py-2 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id} className="table-row">
                      <td className="py-2.5 px-4 font-medium">{acc.name}</td>
                      <td className="py-2.5 px-4 text-right">{formatCurr(acc.opening_balance)}</td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => toggleAccount(acc.id, !acc.is_active)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${acc.is_active ? 'bg-brand-green' : 'bg-slate-300'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${acc.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openModal('account', acc)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={13} /></button>
                          <button onClick={async () => { await supabase.from('accounts').delete().eq('id', acc.id); loadAll() }} className="p-1.5 text-slate-400 hover:text-brand-red hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {accounts.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-10 text-slate-400">{t('common_noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'suppliers' && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800">{t('settings_supplierList')}</h2>
                <button onClick={() => openModal('supplier')} className="btn-primary"><Plus size={16} /> {t('common_add')}</button>
              </div>
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="text-left py-2 px-3">{t('settings_companyName')}</th>
                    <th className="text-left py-2 px-3">{t('settings_personName')}</th>
                    <th className="text-left py-2 px-3">{t('common_phone')}</th>
                    <th className="text-right py-2 px-3">{t('settings_openingDue')}</th>
                    <th className="text-left py-2 px-3">{t('settings_dueType')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(sup => (
                    <tr key={sup.id} className="table-row">
                      <td className="py-2 px-3 font-medium">{sup.company_name || sup.name}</td>
                      <td className="py-2 px-3 text-slate-500">{sup.person_name}</td>
                      <td className="py-2 px-3 text-slate-500">{sup.phone}</td>
                      <td className="py-2 px-3 text-right font-medium text-brand-red">{formatCurr(sup.opening_due)}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sup.due_type === 'pawna' ? 'badge-green' : 'badge-red'}`}>
                          {sup.due_type === 'pawna' ? t('settings_pawnaReceivable').split(' ')[0] : t('settings_denaPayable').split(' ')[0]}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openModal('supplier', sup)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Pencil size={13} /></button>
                          <button onClick={async () => { await supabase.from('suppliers').delete().eq('id', sup.id); loadAll() }} className="p-1 text-slate-400 hover:text-brand-red hover:bg-red-50 rounded transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {suppliers.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t('common_noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'targets' && (
            <div className="card p-0">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">{t('settings_targetsList')} ({targets.length})</h2>
                <button onClick={() => { setEditTarget(null); setShowTargetModal(true) }} className="btn-primary">
                  <Plus size={16} /> {t('settings_addTarget')}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="text-left py-2 px-4">{t('settings_monthStar')}</th>
                    <th className="text-left py-2 px-4">{t('settings_yearStar')}</th>
                    <th className="text-right py-2 px-4">{t('settings_salesTarget')}</th>
                    <th className="text-right py-2 px-4">{t('settings_profitTarget')}</th>
                    <th className="py-2 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map(tgt => (
                    <tr key={tgt.id} className="table-row">
                      <td className="py-2.5 px-4 font-medium">{monthName(tgt.month)}</td>
                      <td className="py-2.5 px-4 text-slate-500">{tgt.year}</td>
                      <td className="py-2.5 px-4 text-right font-medium text-blue-600">{formatCurr(tgt.sales_target)}</td>
                      <td className="py-2.5 px-4 text-right font-medium text-brand-green">{formatCurr(tgt.profit_target)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditTarget(tgt); setShowTargetModal(true) }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={13} /></button>
                          <button onClick={() => deleteTarget(tgt.id)} className="p-1.5 text-slate-400 hover:text-brand-red hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {targets.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-10 text-slate-400">{t('common_noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="card p-0">
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">{t('settings_usersList')} ({users.length})</h2>
                  <button onClick={() => setShowCreateUser(true)} className="btn-primary">
                    <Plus size={16} /> {t('settings_newUser')}
                  </button>
                </div>

                {usersLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin w-6 h-6 border-4 border-brand-green border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="table-header">
                      <tr>
                        <th className="text-left py-2 px-4">{t('common_name')}</th>
                        <th className="text-left py-2 px-4">{t('common_email')}</th>
                        <th className="text-left py-2 px-4">{t('common_phone')}</th>
                        <th className="text-left py-2 px-4">{t('common_type')}</th>
                        <th className="py-2 px-4 text-center">{t('common_status')}</th>
                        <th className="py-2 px-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => {
                        const isSelf = u.id === currentProfile?.id
                        return (
                          <tr key={u.id} className="table-row">
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${u.role === 'owner' ? 'bg-brand-green' : u.role === 'manager' ? 'bg-blue-500' : u.role === 'sales_staff' ? 'bg-orange-500' : 'bg-slate-500'}`}>
                                  {(u.full_name || u.email || '?')[0].toUpperCase()}
                                </div>
                                <span className="font-medium">{u.full_name || '—'}</span>
                                {isSelf && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{t('settings_youLabel')}</span>}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-slate-500 text-xs">{u.email}</td>
                            <td className="py-2.5 px-4 text-slate-500">{u.phone || '—'}</td>
                            <td className="py-2.5 px-4">
                              {isSelf ? (
                                <span className="badge-green">{ROLE_LABELS[u.role]}</span>
                              ) : (
                                <select value={u.role} onChange={e => updateUserRole(u.id, e.target.value)} className="input py-1 text-xs w-44">
                                  <option value="owner">{t('settings_roleOwner')}</option>
                                  <option value="manager">{t('settings_roleManager')}</option>
                                  <option value="sales_staff">{t('settings_roleSalesStaff')}</option>
                                  <option value="accountant">{t('settings_roleAccountant')}</option>
                                </select>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              {isSelf ? (
                                <span className="badge-green">{t('common_active')}</span>
                              ) : (
                                <button
                                  onClick={() => toggleUserActive(u.id, !u.is_active)}
                                  className={`flex items-center gap-1 mx-auto text-xs px-2 py-1 rounded-lg transition-colors ${u.is_active ? 'bg-green-50 text-brand-green hover:bg-green-100' : 'bg-red-50 text-brand-red hover:bg-red-100'}`}
                                >
                                  {u.is_active ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
                                  {u.is_active ? t('common_active') : t('common_inactive')}
                                </button>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              {!isSelf && (
                                <button onClick={() => toggleUserActive(u.id, false)} className="text-slate-300 hover:text-brand-red transition-colors p-1 rounded-lg hover:bg-red-50" title="Deactivate"><Trash2 size={14} /></button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      {users.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t('common_noData')}</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

          {showTargetModal && (
            <TargetModal
              item={editTarget}
              existingTargets={targets}
              ownerId={currentProfile?.owner_id || currentProfile?.id || null}
              onClose={() => { setShowTargetModal(false); setEditTarget(null); loadAll() }}
            />
          )}

      {showCreateUser && (
        <CreateUserModalV2 onClose={() => { setShowCreateUser(false); loadUsers() }} />
      )}

      {showDeleteConfirm && (
        <Modal isOpen onClose={() => setShowDeleteConfirm(null)} title={t('common_confirm')} size="sm">
          <div className="text-center py-2">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-brand-red" />
            </div>
            <p className="font-semibold text-slate-800 mb-1">{showDeleteConfirm.full_name || showDeleteConfirm.email}</p>
            <p className="text-sm text-slate-500 mb-6">{showDeleteConfirm.email}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
              <button onClick={() => deleteUser(showDeleteConfirm.id)} className="btn-danger flex-1 justify-center"><Trash2 size={14} /> {t('common_delete')}</button>
            </div>
          </div>
        </Modal>
      )}

      {showModal && modalType === 'shareholder' && (
        <ShareholderModal item={editItem} onClose={() => { setShowModal(false); loadAll() }} />
      )}
      {showModal && modalType === 'account' && (
        <AccountModal item={editItem} onClose={() => { setShowModal(false); loadAll() }} />
      )}
      {showModal && modalType === 'supplier' && (
        <SupplierModal item={editItem} onClose={() => { setShowModal(false); loadAll() }} />
      )}
    </div>
  )
}

function TargetModal({ item, existingTargets, ownerId, onClose }: { item: any; existingTargets: any[]; ownerId: string | null; onClose: () => void }) {
  const { t, formatCurr, monthName } = useLang()
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i)
  const [form, setForm] = useState({
    month: item?.month ?? (new Date().getMonth() + 1),
    year: item?.year ?? currentYear,
    sales_target: item?.sales_target ?? 0,
    profit_target: item?.profit_target ?? 0,
  })
  const [loading, setLoading] = useState(false)

  function isDuplicateTargetError(error: any) {
    const message = String(error?.message || '')
    return error?.code === '23505' || message.includes('monthly_targets_year_month_key')
  }

  async function save() {
    setLoading(true)
    try {
      const payload = {
        month: Number(form.month),
        year: Number(form.year),
        sales_target: Number(form.sales_target || 0),
        profit_target: Number(form.profit_target || 0),
        owner_id: ownerId,
        updated_at: new Date().toISOString(),
      }

      if (item?.id) {
        const duplicate = existingTargets.find(t => (
          Number(t.month) === payload.month &&
          Number(t.year) === payload.year &&
          t.id !== item.id
        ))
        if (duplicate) {
          toast.error('This month target already exists!')
          return
        }

        const { error } = await supabase.from('monthly_targets').update(payload).eq('id', item.id)
        if (error) {
          toast.error(isDuplicateTargetError(error) ? 'This month target already exists!' : error.message)
          return
        }
        toast.success(t('common_updated'))
      } else {
        const exists = existingTargets.find(t => Number(t.month) === payload.month && Number(t.year) === payload.year)
        if (exists?.id) {
          const { error } = await supabase.from('monthly_targets').update(payload).eq('id', exists.id)
          if (error) {
            toast.error(error.message)
            return
          }
          toast.success(t('common_updated'))
          onClose()
          return
        }

        const { error } = await supabase
          .from('monthly_targets')
          .upsert(payload, { onConflict: 'year,month' })
        if (error) {
          if (isDuplicateTargetError(error)) {
            toast.error('This month target already exists!')
          } else {
            toast.error(error.message)
          }
          return
        }
        toast.success(t('common_added'))
      }
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={item ? t('settings_editTarget') : t('settings_addTarget')} size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('settings_monthStar')}</label>
            <select className="input" value={form.month} onChange={e => setForm({ ...form, month: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('settings_yearStar')}</label>
            <select className="input" value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">{t('settings_salesTarget')}</label>
          <input type="number" min="0" className="input" value={form.sales_target} onChange={e => setForm({ ...form, sales_target: Number(e.target.value) })} placeholder="0" />
        </div>
        <div>
          <label className="label">{t('settings_profitTarget')}</label>
          <input type="number" min="0" className="input" value={form.profit_target} onChange={e => setForm({ ...form, profit_target: Number(e.target.value) })} placeholder="0" />
        </div>
        <div className="pt-1 p-3 rounded-xl bg-slate-50 text-sm text-slate-600">
          <span className="font-medium">{monthName(form.month)} {form.year}</span> — {t('settings_salesTarget').split(' ')[0]}: <span className="text-blue-600 font-medium">{formatCurr(form.sales_target)}</span>, {t('settings_profitTarget').split(' ')[0]}: <span className="text-brand-green font-medium">{formatCurr(form.profit_target)}</span>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={save} disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={15} />}
            {loading ? t('common_saving') : t('common_save')}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}

function CreateUserModalV2({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    username: '',
    password: '',
    confirm_password: '',
    phone: '',
    role: 'sales_staff',
    branch: '',
    status: 'active',
    joining_date: new Date().toISOString().split('T')[0],
    address: '',
    password_expiry_days: 90,
    two_factor: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const permissionGroups = [
    { title: 'Purchase', icon: <ShoppingCart size={17} />, items: ['View Purchase', 'Add Purchase', 'Edit Purchase', 'Delete Purchase', 'Purchase Book', 'Purchase Book Edit', 'Purchase Book Delete'] },
    { title: 'Sales', icon: <ShoppingCart size={17} />, items: ['View Sales', 'New Sale', 'Quick Sale', 'Cart Edit', 'Discount', 'Delivery Charge', 'Transaction List', 'Edit Sale', 'Delete Sale'] },
    { title: 'Due Management', icon: <CreditCard size={17} />, items: ['View Due', 'Due History', 'Add Due', 'Edit Due', 'Delete Due'] },
    { title: 'Expenses', icon: <Calculator size={17} />, items: ['View Expense', 'Add Expense', 'Edit Expense', 'Delete Expense', 'Category Add', 'Category Edit', 'Category Delete'] },
    { title: 'Contacts - Customers', icon: <Users size={17} />, items: ['View Customer', 'Add Customer', 'Edit Customer', 'Delete Customer'] },
    { title: 'Contacts - Suppliers', icon: <Truck size={17} />, items: ['View Supplier', 'Add Supplier', 'Edit Supplier', 'Delete Supplier'] },
    { title: 'Contacts - Employees', icon: <UserCog size={17} />, items: ['View Employee', 'Add Employee', 'Edit Employee', 'Delete Employee'] },
    { title: 'Inventory', icon: <Package size={17} />, items: ['Product List', 'Add Product', 'Edit Product', 'Delete Product', 'Stock Book', 'Stock History', 'Stock Update'] },
    { title: 'Reports', icon: <BarChart3 size={17} />, items: ['Sales Report', 'Purchase Report', 'Expense Report', 'Customer Report', 'Supplier Report', 'Profit Report'] },
    { title: 'Settings & System', icon: <Cog size={17} />, items: ['Business Settings', 'User Management', 'Backup', 'Restore'] },
  ]
  const allPermissions = permissionGroups.flatMap(group => group.items)
  const templatePermissions: Record<string, string[]> = {
    owner: allPermissions,
    manager: allPermissions.filter(item => !item.includes('Delete') && !['User Management', 'Backup', 'Restore'].includes(item)),
    sales_staff: ['View Sales', 'New Sale', 'Quick Sale', 'Cart Edit', 'Discount', 'Delivery Charge', 'Transaction List', 'View Customer', 'Add Customer', 'Edit Customer', 'Product List', 'Stock Book'],
    inventory_manager: ['Product List', 'Add Product', 'Edit Product', 'Delete Product', 'Stock Book', 'Stock History', 'Stock Update', 'View Supplier', 'Add Supplier', 'Edit Supplier'],
    accountant: ['View Due', 'Due History', 'Add Due', 'Edit Due', 'View Expense', 'Add Expense', 'Edit Expense', 'Sales Report', 'Purchase Report', 'Expense Report', 'Customer Report', 'Supplier Report', 'Profit Report'],
    custom: [],
  }
  const [selectedTemplate, setSelectedTemplate] = useState('sales_staff')
  const [permissions, setPermissions] = useState<string[]>(templatePermissions.sales_staff)
  const templates = [
    { id: 'owner', role: 'owner', label: 'Owner', icon: <Crown size={15} />, className: 'border-purple-200 bg-purple-50 text-purple-700' },
    { id: 'manager', role: 'manager', label: 'Manager', icon: <Briefcase size={15} />, className: 'border-blue-200 bg-blue-50 text-blue-700' },
    { id: 'sales_staff', role: 'sales_staff', label: 'Sales Staff', icon: <UserRoundPlus size={15} />, className: 'border-green-200 bg-green-50 text-brand-green' },
    { id: 'inventory_manager', role: 'manager', label: 'Inventory Manager', icon: <Package size={15} />, className: 'border-orange-200 bg-orange-50 text-orange-700' },
    { id: 'accountant', role: 'accountant', label: 'Accountant', icon: <Calculator size={15} />, className: 'border-purple-200 bg-purple-50 text-purple-700' },
    { id: 'custom', role: form.role, label: 'Custom Access', icon: <Cog size={15} />, className: 'border-slate-200 bg-white text-slate-700' },
  ]

  function applyTemplate(template: typeof templates[number]) {
    setSelectedTemplate(template.id)
    setForm(prev => ({ ...prev, role: template.role }))
    setPermissions(templatePermissions[template.id] || [])
  }

  function togglePermission(permission: string) {
    setSelectedTemplate('custom')
    setPermissions(prev => prev.includes(permission) ? prev.filter(item => item !== permission) : [...prev, permission])
  }

  async function save() {
    if (!form.full_name || !form.email || !form.password) return toast.error(t('common_fillAllFields'))
    if (form.password.length < 6) return toast.error(t('settings_passwordStar'))
    if (form.password !== form.confirm_password) return toast.error('Passwords do not match')

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return toast.error(t('common_error'))
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users/create`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            password: form.password,
            phone: form.phone,
            role: form.role,
            is_active: form.status === 'active',
            permissions,
          }),
        },
      )
      const json = await res.json()
      if (json.success) {
        toast.success(t('common_added'))
        onClose()
      } else {
        toast.error(json.error || t('common_error'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Create New User" size="full">
      <div className="flex min-h-full flex-col space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-green shadow-sm">
              <UserRoundPlus size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Create New User</h3>
              <p className="text-xs text-slate-500">Add profile details, login role and access permissions.</p>
            </div>
          </div>
          <span className="hidden rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm sm:inline-flex">Secure user setup</span>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800">User Information</h4>
                <span className="text-[11px] font-semibold text-slate-400">Required fields marked *</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[124px_1fr]">
                <button type="button" className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 transition hover:border-brand-green hover:bg-green-50 hover:text-brand-green">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700"><Camera size={22} /></span>
                  <span className="text-xs font-semibold">Upload Photo</span>
                  <span className="text-[10px] text-slate-400">JPG, PNG</span>
                </button>
                <div className="space-y-3">
                  <label><span className="label">Full Name *</span><input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Ahmed Rahman" /></label>
                  <label><span className="label">Email *</span><input type="email" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ahmedrahman@gmail.com" /></label>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label><span className="label">Phone Number</span><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+880 1712-345678" /></label>
                <label><span className="label">Username</span><input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="ahmed.rahman" /></label>
                <label>
                  <span className="label">Password *</span>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} className="input pr-9" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </div>
                </label>
                <label>
                  <span className="label">Confirm Password *</span>
                  <div className="relative">
                    <input type={showConfirmPassword ? 'text' : 'password'} className="input pr-9" value={form.confirm_password} onChange={e => setForm({ ...form, confirm_password: e.target.value })} placeholder="Confirm password" />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </div>
                </label>
                <label>
                  <span className="label">Role *</span>
                  <select className="input" value={form.role} onChange={e => { setSelectedTemplate('custom'); setForm({ ...form, role: e.target.value }) }}>
                    <option value="owner">{t('settings_roleOwner')}</option>
                    <option value="manager">{t('settings_roleManager')}</option>
                    <option value="sales_staff">{t('settings_roleSalesStaff')}</option>
                    <option value="accountant">{t('settings_roleAccountant')}</option>
                  </select>
                </label>
                <label>
                  <span className="label">Status</span>
                  <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label>
                  <span className="label">Joining Date</span>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input type="date" className="input pl-9" value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })} />
                  </div>
                </label>
                <label className="sm:col-span-2">
                  <span className="label">Address</span>
                  <textarea className="input min-h-20" maxLength={200} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="House, road, city" />
                  <p className="mt-1 text-right text-[10px] text-slate-400">{form.address.length} / 200</p>
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><ShieldCheck size={16} className="text-blue-600" />Account Settings</h4>
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span><span className="block font-semibold">Two Factor Authentication</span><span className="text-xs text-slate-500">Require verification code at login</span></span>
                  <input type="checkbox" checked={form.two_factor} onChange={e => setForm({ ...form, two_factor: e.target.checked })} className="h-5 w-5 accent-brand-green" />
                </label>
                <label><span className="label">Password Expiry (Days)</span><input type="number" min="1" className="input" value={form.password_expiry_days} onChange={e => setForm({ ...form, password_expiry_days: Number(e.target.value) })} /></label>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck size={20} /></div>
                <div><h4 className="text-sm font-bold text-slate-800">Permissions & Access Control</h4><p className="text-xs text-slate-500">Start with a template, then fine tune module access.</p></div>
              </div>
            </div>
            <p className="mb-2 text-xs font-bold text-slate-700">Quick Permission Templates</p>
            <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6">
              {templates.map(template => (
                <button type="button" key={template.id} onClick={() => applyTemplate(template)} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-xs font-semibold transition ${selectedTemplate === template.id ? 'ring-2 ring-brand-green ring-offset-1' : ''} ${template.className}`}>
                  {template.icon}<span>{template.label}</span>
                </button>
              ))}
            </div>
            <div className="mb-4 flex flex-wrap gap-2 border-y border-slate-100 py-3">
              <button type="button" onClick={() => { setSelectedTemplate('custom'); setPermissions(allPermissions) }} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-brand-green"><Check size={13} className="mr-1 inline" />Select All</button>
              <button type="button" onClick={() => { setSelectedTemplate('custom'); setPermissions([]) }} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-brand-red"><X size={13} className="mr-1 inline" />Unselect All</button>
            </div>
            <div className="grid max-h-[calc(100vh-420px)] min-h-[420px] grid-cols-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-2 2xl:grid-cols-3">
              {permissionGroups.map(group => (
                <div key={group.title} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
                  <h5 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{group.icon}</span>{group.title}</h5>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.items.map(item => (
                      <label key={item} className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" checked={permissions.includes(item)} onChange={() => togglePermission(item)} className="h-4 w-4 accent-brand-green" />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-6 mt-4 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white/95 px-6 pt-4 backdrop-blur sm:flex-row sm:justify-end">
        <button onClick={onClose} className="btn-secondary justify-center sm:w-32">{t('common_cancel')}</button>
        <button type="button" className="btn-secondary justify-center sm:w-36"><Save size={15} />Save Draft</button>
        <button onClick={save} disabled={loading} className="btn-primary justify-center sm:w-40">
          {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <UserRoundPlus size={16} />}
          {loading ? t('settings_creating') : t('settings_createUserBtn')}
        </button>
      </div>
    </Modal>
  )
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '', role: 'sales_staff' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function save() {
    if (!form.full_name || !form.email || !form.password) {
      toast.error(t('common_fillAllFields'))
      return
    }
    if (form.password.length < 6) {
      toast.error(t('settings_passwordStar'))
      return
    }
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return toast.error(t('common_error'))
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users/create`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      )
      const json = await res.json()
      if (json.success) {
        toast.success(t('common_added'))
        onClose()
      } else {
        toast.error(json.error || t('common_error'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={t('settings_createUser')} size="lg">
      <div className="space-y-3">
        <div>
          <label className="label">{t('settings_fullName')}</label>
          <input className="input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder={t('settings_fullNamePlaceholder')} />
        </div>
        <div>
          <label className="label">{t('settings_emailStar')}</label>
          <input type="email" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder={t('settings_emailPlaceholder')} />
        </div>
        <div>
          <label className="label">{t('settings_passwordStar')}</label>
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} className="input pr-9" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="label">{t('common_phone')}</label>
          <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder={t('settings_phonePlaceholder')} />
        </div>
        <div>
          <label className="label">{t('settings_roleStar')}</label>
          <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="owner">{t('settings_roleOwner')}</option>
            <option value="manager">{t('settings_roleManager')}</option>
            <option value="sales_staff">{t('settings_roleSalesStaff')}</option>
            <option value="accountant">{t('settings_roleAccountant')}</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100">
        <button onClick={save} disabled={loading} className="btn-primary flex-1 justify-center">
          {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Plus size={16} />}
          {loading ? t('settings_creating') : t('settings_createUserBtn')}
        </button>
        <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
      </div>
    </Modal>
  )
}

function ShareholderModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { t } = useLang()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<ShareholderValidationErrors>({})
  const [form, setForm] = useState({
    name: item?.name || '',
    phone: item?.phone || '',
    address: item?.address || '',
    opening_amount: Number(item?.opening_amount || 0),
    share_percentage: Number(item?.share_percentage || 0),
  })

  function clearError(field: keyof ShareholderValidationErrors) {
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

  function inputClass(hasError: boolean) {
    return `input ${hasError ? 'border-red-300 focus:ring-red-400' : ''}`
  }

  async function save() {
    const nextErrors: ShareholderValidationErrors = {}
    const name = form.name.trim()
    const phone = form.phone.trim()

    if (!name) nextErrors.name = REQUIRED_FIELD_MESSAGE
    if (!phone) nextErrors.phone = REQUIRED_FIELD_MESSAGE

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setLoading(true)
    try {
      const payload = {
        ...form,
        name,
        phone,
        address: form.address.trim(),
        opening_amount: Number(form.opening_amount || 0),
        share_percentage: Number(form.share_percentage || 0),
      }
      const basePayload = {
        name: payload.name,
        phone: payload.phone,
        address: payload.address,
        share_percentage: payload.share_percentage,
      }
      const result = item?.id
        ? await supabase.from('shareholders').update(payload).eq('id', item.id)
        : await supabase.from('shareholders').insert(payload).select('id').maybeSingle()

      if (result.error) {
        if (!isMissingOpeningAmountColumn(result.error)) {
          toast.error(result.error.message || t('common_error'))
          return
        }

        const retry = item?.id
          ? await supabase.from('shareholders').update(basePayload).eq('id', item.id)
          : await supabase.from('shareholders').insert(basePayload).select('id').maybeSingle()

        if (retry.error) {
          toast.error(retry.error.message || t('common_error'))
          return
        }

        const shareholderId = item?.id || retry.data?.id
        saveShareholderOpeningAmountFallback(shareholderId, payload.opening_amount)
      } else {
        const shareholderId = item?.id || result.data?.id
        saveShareholderOpeningAmountFallback(shareholderId, payload.opening_amount)
      }

      toast.success(t('common_saved'))
      onClose()
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal isOpen onClose={onClose} title={item ? t('settings_editShareholder') : t('settings_newShareholder')}>
      <div className="space-y-3">
        <div>
          <label className="label">{requiredLabel(t('common_name'))}</label>
          <input
            className={inputClass(Boolean(errors.name))}
            value={form.name}
            onChange={e => {
              clearError('name')
              setForm({ ...form, name: e.target.value })
            }}
            required
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label className="label">{requiredLabel(t('common_phone'))}</label>
          <input
            className={inputClass(Boolean(errors.phone))}
            value={form.phone}
            onChange={e => {
              clearError('phone')
              setForm({ ...form, phone: e.target.value })
            }}
            required
          />
          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
        </div>
        <div><label className="label">{t('common_address')}</label><input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
        <div>
          <label className="label">{t('invest_openingAmount')} (৳)</label>
          <input
            type="number"
            min="0"
            className="input"
            value={form.opening_amount || ''}
            onChange={e => setForm({ ...form, opening_amount: Number(e.target.value) })}
            placeholder="0"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={16} />}
            {t('common_save')}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}

function AccountModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { t } = useLang()
  const [form, setForm] = useState({ name: item?.name || '', type: item?.type || 'cash', opening_balance: item?.opening_balance || 0 })
  const [loading, setLoading] = useState(false)

  async function save() {
    if (!form.name.trim()) { toast.error(t('common_fillAllFields')); return }
    setLoading(true)
    try {
      if (item?.id) { await supabase.from('accounts').update(form).eq('id', item.id) }
      else { await supabase.from('accounts').insert({ ...form, is_active: true }) }
      toast.success(t('common_saved'))
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={item ? `${t('common_edit')} — ${item.name}` : `${t('common_add')} ${t('settings_tabAccounts')}`}>
      <div className="space-y-4">
        <div>
          <label className="label">{t('common_name')} *</label>
          <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div>
          <label className="label">{t('settings_openingBalance')} (৳)</label>
          <input type="number" min="0" className="input" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: Number(e.target.value) })} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={15} />}
            {t('common_save')}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}

function SupplierModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { t } = useLang()
  const [form, setForm] = useState({
    company_name: item?.company_name || item?.name || '',
    person_name: item?.person_name || '',
    phone: item?.phone || '',
    email: item?.email || '',
    address: item?.address || '',
    opening_due: item?.opening_due || 0,
    due_type: item?.due_type || 'dena',
  })
  const [loading, setLoading] = useState(false)

  async function save() {
    if (!form.company_name.trim()) { toast.error(t('settings_companyNameRequired')); return }
    if (!form.phone.trim()) { toast.error(t('settings_phoneRequired')); return }
    setLoading(true)
    try {
      const payload = { ...form, name: form.company_name }
      if (item?.id) { await supabase.from('suppliers').update(payload).eq('id', item.id) }
      else { await supabase.from('suppliers').insert(payload) }
      toast.success(t('common_saved'))
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={item ? t('settings_editSupplier') : t('settings_newSupplier')} size="sm">
      <div className="space-y-3">
        <div>
          <label className="label">{t('settings_companyName')} *</label>
          <input className="input" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('settings_personName')}</label>
          <input className="input" value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('settings_phoneStar')}</label>
          <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('common_email')}</label>
          <input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('common_address')}</label>
          <input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('settings_openingDueTaka')}</label>
            <input type="number" min="0" className="input" value={form.opening_due} onChange={e => setForm({ ...form, opening_due: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">{t('settings_dueType')}</label>
            <select className="input" value={form.due_type} onChange={e => setForm({ ...form, due_type: e.target.value })}>
              <option value="dena">{t('settings_denaPayable')}</option>
              <option value="pawna">{t('settings_pawnaReceivable')}</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={save} disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={15} />}
            {t('common_save')}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}
