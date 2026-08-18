import React, { useRef, useState } from 'react'
import { CameraIcon as Camera, FloppyDiskIcon as Save } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { updateOwnProfile, updateTeamUser } from '../services/admin.services'
import { uploadImage } from '../services/product.services'
import { isValidBdPhone, INVALID_PHONE_MESSAGE } from '../lib/phone'
import { PERMISSION_GROUPS } from '../lib/permissions'

const ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager' },
  { value: 'sales_staff', label: 'Sales Staff' },
  { value: 'accountant', label: 'Accountant' },
]

/**
 * Edits one user: photo, name, phone, and - for staff - role and status.
 *
 * Which endpoint it uses depends on who is being edited. /users/update manages
 * staff and refuses the caller's own row on purpose, so a person editing
 * themselves goes through /users/me. That route deliberately cannot change
 * role or status: an owner who demoted or deactivated themselves would be
 * locked out of their own workspace with nobody able to let them back in.
 */
export default function EditUserModal({ user, onClose }: { user: any; onClose: () => void }) {
  const { t } = useLang()
  const { profile, refreshAccount } = useAuth()
  const isSelf = user?.id === profile?.id

  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    role: user?.role || 'sales_staff',
    is_active: user?.is_active !== false,
    avatar_url: String(user?.avatar_url || ''),
  })
  // What this user may do within their role. An empty list means "everything the
  // role allows", which is what every existing team member has - so opening this
  // modal on an untouched user shows nothing ticked and saving without touching
  // the boxes leaves them exactly as they were.
  const [permissions, setPermissions] = useState<string[]>(user?.permissions ?? [])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const initial = (form.full_name.trim()[0] || user?.email?.[0] || 'U').toUpperCase()

  async function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared straight away, so choosing the same file again after a failed
    // upload still fires a change event.
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error(t('user_photoOnlyImage'))
    if (file.size > 5 * 1024 * 1024) return toast.error(t('user_photoTooLarge'))

    setUploading(true)
    try {
      const { url } = await uploadImage(file)
      setForm(current => ({ ...current, avatar_url: url }))
    } catch (error: any) {
      toast.error(error.message || t('user_photoFailed'))
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!form.full_name.trim()) return toast.error(t('common_fillAllFields'))
    if (form.phone.trim() && !isValidBdPhone(form.phone.trim())) return toast.error(INVALID_PHONE_MESSAGE)
    if (uploading) return toast.error(t('user_photoWait'))

    setSaving(true)
    try {
      if (isSelf) {
        await updateOwnProfile({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          avatar_url: form.avatar_url,
        })
        // The header shows your own name and photo, so it has to follow.
        await refreshAccount()
      } else {
        await updateTeamUser({
          user_id: user.id,
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          role: form.role,
          is_active: form.is_active,
          avatar_url: form.avatar_url,
          permissions,
        })
      }
      toast.success(t('common_updated'))
      onClose()
    } catch (error: any) {
      toast.error(error.message || t('common_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={t('common_edit')} size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 text-lg font-bold text-neutral-700 disabled:cursor-wait"
          >
            {form.avatar_url
              ? <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
              : initial}
          </button>
          <div>
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary text-xs" disabled={uploading}>
              <Camera size={14} /> {uploading ? t('user_uploadingPhoto') : t(form.avatar_url ? 'user_changePhoto' : 'user_uploadPhoto')}
            </button>
            {form.avatar_url && (
              <button
                type="button"
                onClick={() => setForm(current => ({ ...current, avatar_url: '' }))}
                className="ml-2 text-xs font-semibold text-brand-red hover:underline"
              >
                {t('common_delete')}
              </button>
            )}
            <p className="mt-1.5 text-[11px] text-neutral-500">{t('user_photoHint')}</p>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="edit-user-name">{t('common_name')}</label>
          <input
            id="edit-user-name"
            className="input"
            value={form.full_name}
            onChange={e => setForm({ ...form, full_name: e.target.value })}
          />
        </div>

        <div>
          <label className="label" htmlFor="edit-user-phone">{t('common_phone')}</label>
          <input
            id="edit-user-phone"
            className="input"
            value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })}
            placeholder="01XXXXXXXXX"
          />
        </div>

        {/* Role and status are for staff. Shown read-only for your own row so
            it is clear why they cannot be touched here. */}
        {isSelf ? (
          <p className="rounded-lg bg-brand-blue-soft px-3 py-2.5 text-xs text-brand-blue">
            {t('user_selfRoleNotice')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="edit-user-role">{t('settings_role')}</label>
              <select
                id="edit-user-role"
                className="input"
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}
              >
                {ROLE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="edit-user-status">{t('common_status')}</label>
              <select
                id="edit-user-status"
                className="input"
                value={form.is_active ? 'active' : 'inactive'}
                onChange={e => setForm({ ...form, is_active: e.target.value === 'active' })}
              >
                <option value="active">{t('common_active')}</option>
                <option value="inactive">{t('common_inactive')}</option>
              </select>
            </div>
          </div>
        )}

        {/* Permissions, for staff only.
            The create screen had these and this one did not, so a permission set
            at creation could never be seen again, let alone changed. Nothing
            ticked means "everything the role allows" - which is what every user
            created before this existed has, and why an untouched user shows an
            empty grid and keeps working exactly as before. */}
        {!isSelf && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">{t('settings_permissions', 'Permissions')}</label>
              <span className="text-[11px] text-slate-400">
                {permissions.length === 0
                  ? t('settings_permissionsAll', 'Nothing ticked = full access for this role')
                  : `${permissions.length} selected`}
              </span>
            </div>
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.title}>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{group.title}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {group.items.map(item => (
                      <label key={item} className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-brand-green focus:ring-brand-green"
                          checked={permissions.includes(item)}
                          onChange={() => setPermissions(current =>
                            current.includes(item)
                              ? current.filter(value => value !== item)
                              : [...current, item]
                          )}
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            <Save size={15} /> {saving ? t('common_saving') : t('common_save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
