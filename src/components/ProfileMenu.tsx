import React, { useEffect, useRef, useState } from 'react'
import { BuildingsIcon as Building2, CaretDownIcon as ChevronDown, EnvelopeSimpleIcon as Mail, PhoneIcon as Phone, GearSixIcon as SettingsIcon } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { useBusinessBrand } from '../lib/businessBrand'
import BusinessInfoModal from './BusinessInfoModal'

/**
 * The signed-in identity, in the header beside the bell.
 *
 * Opening it shows who is signed in and which business they are signed in to,
 * and hands off to Settings to change any of it - the fields live there, and
 * duplicating them into a dropdown would leave two places to keep in step.
 */
export default function ProfileMenu() {
  const { profile, user } = useAuth()
  const { t } = useLang()
  const brand = useBusinessBrand()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const name = profile?.full_name || user?.email || 'Owner'
  const role = String(profile?.role || 'owner').replace('_', ' ')
  // The photo an owner uploads for themselves; empty means show initials.
  const avatar = String((profile as any)?.avatar_url || '').trim()
  const initial = (name.trim()[0] || 'O').toUpperCase()

  // Edited here rather than on a page of its own: this is where the same
  // fields are already being shown.
  function openBusinessInfo() {
    setOpen(false)
    setEditing(true)
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex items-center gap-1.5 rounded-full p-0.5 transition-colors hover:bg-neutral-100"
        title={name}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-900 text-xs font-bold text-white">
          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initial}
        </span>
        <ChevronDown size={14} className="text-neutral-500" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center gap-3 border-b border-neutral-200 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-900 text-base font-bold text-white">
              {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy-900">{name}</p>
              <p className="truncate text-xs capitalize text-neutral-500">{role}</p>
            </div>
          </div>

          <div className="space-y-2.5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
              {t('settings_businessInfo', 'Business Info')}
            </p>

            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-500">
                {brand.logoUrl
                  ? <img src={brand.logoUrl} alt="" className="h-full w-full object-cover" />
                  : <Building2 size={15} />}
              </span>
              <span className="min-w-0 truncate text-sm font-semibold text-navy-900">{brand.name}</span>
            </div>

            {user?.email && (
              <div className="flex items-center gap-2.5 text-xs text-neutral-700">
                <Mail size={14} className="shrink-0 text-neutral-500" />
                <span className="min-w-0 truncate">{user.email}</span>
              </div>
            )}

            {profile?.phone && (
              <div className="flex items-center gap-2.5 text-xs text-neutral-700">
                <Phone size={14} className="shrink-0 text-neutral-500" />
                <span className="min-w-0 truncate">{profile.phone}</span>
              </div>
            )}
          </div>

          <div className="border-t border-neutral-200 p-3">
            <button type="button" onClick={openBusinessInfo} className="btn-primary w-full justify-center text-xs">
              <SettingsIcon size={14} />
              {t('settings_updateBusinessInfo', 'Update business info')}
            </button>
          </div>
        </div>
      )}

      {editing && <BusinessInfoModal onClose={() => setEditing(false)} />}
    </div>
  )
}

// Kept so a future caller can render the plain avatar without the menu.
export function ProfileAvatar({ size = 32 }: { size?: number }) {
  const { profile, user } = useAuth()
  const avatar = String((profile as any)?.avatar_url || '').trim()
  const name = profile?.full_name || user?.email || 'Owner'
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-900 text-xs font-bold text-white"
      style={{ width: size, height: size }}
    >
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : (name.trim()[0] || 'O').toUpperCase()}
    </span>
  )
}
