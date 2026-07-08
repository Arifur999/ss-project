import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const DEFAULT_BUSINESS_NAME = 'My Business'
export const BUSINESS_NAME_STORAGE_KEY = 'business_settings_name'
export const BUSINESS_LOGO_STORAGE_KEY = 'business_settings_logo'
export const BUSINESS_NAME_UPDATED_EVENT = 'business-settings-name-updated'
export const BUSINESS_BRAND_UPDATED_EVENT = 'business-settings-brand-updated'

export function cleanBusinessName(value?: string | null) {
  return String(value || '').trim()
}

export function resolveBusinessName(settings?: { name_en?: string | null; name_bn?: string | null } | null) {
  return cleanBusinessName(settings?.name_en) || cleanBusinessName(settings?.name_bn) || DEFAULT_BUSINESS_NAME
}

export function rememberBusinessName(name: string) {
  const safeName = cleanBusinessName(name) || DEFAULT_BUSINESS_NAME
  localStorage.setItem(BUSINESS_NAME_STORAGE_KEY, safeName)
  window.dispatchEvent(new CustomEvent(BUSINESS_NAME_UPDATED_EVENT, { detail: safeName }))
}

export function rememberBusinessBrand(settings: { name_en?: string | null; name_bn?: string | null; logo_url?: string | null }) {
  const name = resolveBusinessName(settings)
  const logoUrl = String(settings.logo_url || '').trim()
  localStorage.setItem(BUSINESS_NAME_STORAGE_KEY, name)
  localStorage.setItem(BUSINESS_LOGO_STORAGE_KEY, logoUrl)
  window.dispatchEvent(new CustomEvent(BUSINESS_NAME_UPDATED_EVENT, { detail: name }))
  window.dispatchEvent(new CustomEvent(BUSINESS_BRAND_UPDATED_EVENT, { detail: { name, logoUrl } }))
}

export function readRememberedBusinessName() {
  return cleanBusinessName(localStorage.getItem(BUSINESS_NAME_STORAGE_KEY)) || DEFAULT_BUSINESS_NAME
}

export function readRememberedBusinessLogo() {
  return String(localStorage.getItem(BUSINESS_LOGO_STORAGE_KEY) || '').trim()
}

// Used on the public Login page - deliberately does NOT call the API.
//
// business_settings is per-owner in this multi-tenant app, so there is no
// single "the business" to fetch before anyone has logged in (and the
// endpoint requires auth anyway). Calling it here used to 401 in a loop
// every ~10s (each 401 also triggered a doomed refresh-token attempt).
// Instead we just read whatever name was cached from this browser's last
// successful login, falling back to a generic default - Layout's
// useBusinessBrand() (below) is what keeps that cache fresh while logged in.
export function useBusinessBrandName() {
  const [businessName, setBusinessName] = useState(() => readRememberedBusinessName())

  useEffect(() => {
    function handleStoredNameChange(event: Event) {
      const customEvent = event as CustomEvent<string>
      setBusinessName(cleanBusinessName(customEvent.detail) || readRememberedBusinessName())
    }

    function handleStorageChange(event: StorageEvent) {
      if (event.key === BUSINESS_NAME_STORAGE_KEY) {
        setBusinessName(cleanBusinessName(event.newValue) || DEFAULT_BUSINESS_NAME)
      }
    }

    window.addEventListener(BUSINESS_NAME_UPDATED_EVENT, handleStoredNameChange)
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener(BUSINESS_NAME_UPDATED_EVENT, handleStoredNameChange)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  return businessName || DEFAULT_BUSINESS_NAME
}

export function useBusinessBrand() {
  const [brand, setBrand] = useState(() => ({
    name: readRememberedBusinessName(),
    logoUrl: readRememberedBusinessLogo(),
  }))

  useEffect(() => {
    let cancelled = false

    async function loadBusinessBrand() {
      const { data, error } = await supabase
        .from('business_settings')
        .select('name_en, name_bn, logo_url')
        .maybeSingle()

      if (cancelled || error) return

      const nextBrand = {
        name: resolveBusinessName(data),
        logoUrl: String(data?.logo_url || '').trim(),
      }
      setBrand(nextBrand)
      rememberBusinessBrand({ ...data, logo_url: nextBrand.logoUrl })
    }

    function handleBrandChange(event: Event) {
      const customEvent = event as CustomEvent<{ name?: string; logoUrl?: string }>
      setBrand({
        name: cleanBusinessName(customEvent.detail?.name) || readRememberedBusinessName(),
        logoUrl: String(customEvent.detail?.logoUrl ?? readRememberedBusinessLogo()).trim(),
      })
    }

    function handleStorageChange(event: StorageEvent) {
      if (event.key === BUSINESS_NAME_STORAGE_KEY || event.key === BUSINESS_LOGO_STORAGE_KEY) {
        setBrand({
          name: readRememberedBusinessName(),
          logoUrl: readRememberedBusinessLogo(),
        })
      }
    }

    loadBusinessBrand()
    window.addEventListener(BUSINESS_BRAND_UPDATED_EVENT, handleBrandChange)
    window.addEventListener(BUSINESS_NAME_UPDATED_EVENT, loadBusinessBrand)
    window.addEventListener('storage', handleStorageChange)

    const channel = supabase
      .channel('business-settings-sidebar-brand')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_settings' }, loadBusinessBrand)
      .subscribe()

    return () => {
      cancelled = true
      window.removeEventListener(BUSINESS_BRAND_UPDATED_EVENT, handleBrandChange)
      window.removeEventListener(BUSINESS_NAME_UPDATED_EVENT, loadBusinessBrand)
      window.removeEventListener('storage', handleStorageChange)
      supabase.removeChannel(channel)
    }
  }, [])

  return brand
}
