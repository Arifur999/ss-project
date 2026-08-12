import React, { useState, useEffect, useRef } from 'react'
import { Save, Plus, Trash2, Building2, Users, CreditCard, Target, Truck, UserCog, Eye, EyeOff, ShieldCheck, ShieldX, Pencil, Camera, Crown, Briefcase, Package, Calculator, ShoppingCart, UserRoundPlus, BarChart3, Cog, Check, X, CalendarDays } from 'lucide-react'
import { createTeamUser, deleteTeamUser, listTeamUsers, updateTeamUser } from '../services/admin.services'
import { uploadImage } from '../services/product.services'
import toast from 'react-hot-toast'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { todayISO } from '../lib/utils'



export default function Settings() {
  const { t } = useLang()
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<any>(null)
  const { profile: currentProfile } = useAuth()

  useEffect(() => { loadUsers() }, [])

  // Team management now goes through the backend API (replaces the old
  // Supabase manage-users edge function).


  async function loadUsers() {
    setUsersLoading(true)
    try {
      const users = await listTeamUsers()
      setUsers(users || [])
    } catch {
      toast.error(t('settings_failedLoadUsers'))
    } finally {
      setUsersLoading(false)
    }
  }

  async function updateUserRole(userId: string, role: string) {
    try {
      await updateTeamUser({ user_id: userId, role })
    } catch (error: any) {
      return toast.error(error.message || t('common_error'))
    }

    toast.success(t('settings_roleUpdated'))
    loadUsers()
  }

  async function toggleUserActive(userId: string, is_active: boolean) {
    try {
      await updateTeamUser({ user_id: userId, is_active })
    } catch (error: any) {
      return toast.error(error.message || t('common_error'))
    }
    loadUsers()
  }

  async function deleteUser(userId: string) {
    try {
      await deleteTeamUser(userId)
      toast.success(t('common_deleted'))
      setShowDeleteConfirm(null)
      loadUsers()
    } catch (error: any) {
      toast.error(error.message || t('common_error'))
    }
  }









  // Shared delete flow for the simple config tables (shareholders, accounts,
  // suppliers). The old inline handlers fired the delete and immediately
  // reloaded WITHOUT checking .error - so when the backend refused (e.g. a
  // shareholder that still has investment records, blocked by an onDelete:
  // Restrict foreign key), the row silently stayed and the user saw nothing
  // happen. Now we confirm first and surface the real reason on failure.






  const ROLE_LABELS: Record<string, string> = {
    owner: t('settings_roleOwner'),
    manager: t('settings_roleManager'),
    sales_staff: t('settings_roleSalesStaff'),
    accountant: t('settings_roleAccountant'),
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <PageHeader title={t('settings_userManagement', 'User Management')} subtitle={t('settings_usersList')} />

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
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${u.role === 'owner' ? 'bg-slate-900' : u.role === 'manager' ? 'bg-slate-600' : u.role === 'sales_staff' ? 'bg-slate-500' : 'bg-slate-400'}`}>
                              {(u.full_name || u.email || '?')[0].toUpperCase()}
                            </div>
                          )}
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
    </div>
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
    joining_date: todayISO(),
    address: '',
    password_expiry_days: 90,
    two_factor: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  // The photo is uploaded as soon as it is picked, so the create request only
  // ever carries a URL. Picking a second photo simply replaces the first.
  async function handleAvatarPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clear the input straight away, otherwise choosing the same file twice
    // after a failed upload fires no change event at all.
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPG or PNG)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB')
      return
    }

    setUploadingAvatar(true)
    try {
      const { url } = await uploadImage(file)
      setAvatarUrl(url)
    } catch (error: any) {
      toast.error(error.message || 'Could not upload the photo')
    } finally {
      setUploadingAvatar(false)
    }
  }

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
    { id: 'owner', role: 'owner', label: 'Owner', icon: <Crown size={15} />, className: 'border-slate-200 bg-slate-100 text-slate-700' },
    { id: 'manager', role: 'manager', label: 'Manager', icon: <Briefcase size={15} />, className: 'border-slate-200 bg-slate-100 text-slate-700' },
    { id: 'sales_staff', role: 'sales_staff', label: 'Sales Staff', icon: <UserRoundPlus size={15} />, className: 'border-slate-200 bg-slate-100 text-slate-700' },
    { id: 'inventory_manager', role: 'manager', label: 'Inventory Manager', icon: <Package size={15} />, className: 'border-slate-200 bg-slate-100 text-slate-700' },
    { id: 'accountant', role: 'accountant', label: 'Accountant', icon: <Calculator size={15} />, className: 'border-slate-200 bg-slate-100 text-slate-700' },
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
    // Saving mid-upload would drop the photo silently.
    if (uploadingAvatar) return toast.error('Please wait for the photo to finish uploading')

    setLoading(true)
    try {
      await createTeamUser({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        phone: form.phone,
        role: form.role,
        avatar_url: avatarUrl,
      })
      toast.success(t('common_added'))
      onClose()
    } catch (error: any) {
      toast.error(error.message || t('common_error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Create New User" size="full">
      <div className="flex min-h-full flex-col space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
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
                <div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarPick}
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="flex h-36 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white text-slate-500 transition hover:border-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait"
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <>
                        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700"><Camera size={22} /></span>
                        <span className="text-xs font-semibold">{uploadingAvatar ? 'Uploading...' : 'Upload Photo'}</span>
                        <span className="text-[10px] text-slate-400">JPG, PNG</span>
                      </>
                    )}
                  </button>
                  {avatarUrl && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                      <button type="button" className="font-semibold text-slate-500 hover:text-slate-700" onClick={() => avatarInputRef.current?.click()}>
                        Change
                      </button>
                      <button type="button" className="font-semibold text-red-500 hover:text-red-600" onClick={() => setAvatarUrl('')}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
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
              <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><ShieldCheck size={16} className="text-slate-700" />Account Settings</h4>
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
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><ShieldCheck size={20} /></div>
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
              <button type="button" onClick={() => { setSelectedTemplate('custom'); setPermissions(allPermissions) }} className="btn-primary px-3 py-2 text-xs"><Check size={13} />Select All</button>
              <button type="button" onClick={() => { setSelectedTemplate('custom'); setPermissions([]) }} className="btn-secondary px-3 py-2 text-xs"><X size={13} />Unselect All</button>
            </div>
            <div className="grid max-h-[calc(100vh-420px)] min-h-[420px] grid-cols-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-2 2xl:grid-cols-3">
              {permissionGroups.map(group => (
                <div key={group.title} className="rounded-xl border border-slate-200 bg-white/40 p-3">
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
      {/* No backdrop-blur: at 95% opacity it was invisible anyway, and it sits
          inside a modal where it costs a re-blur on every repaint. */}
      <div className="sticky bottom-0 -mx-6 mt-4 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white/95 px-6 pt-4 sm:flex-row sm:justify-end">
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

