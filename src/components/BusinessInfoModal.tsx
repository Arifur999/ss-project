import React, { useEffect, useState } from 'react'
import { CameraIcon as Camera, FloppyDiskIcon as Save, PencilSimpleIcon as Pencil } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import { useLang } from '../context/LanguageContext'
import { rememberBusinessBrand, resolveBusinessName } from '../lib/businessBrand'
import { isValidBdPhone, INVALID_PHONE_MESSAGE } from '../lib/phone'

// The business name, logo, phones and address print on every invoice and
// receipt. They are edited from the profile menu in the header now, rather
// than from a settings tab - the same place they are shown.
const REQUIRED_FIELD_MESSAGE = 'This field is required!'
type BusinessValidationErrors = Partial<Record<'businessName' | 'phone1' | 'address', string>>

export default function BusinessInfoModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const [business, setBusiness] = useState({ name_bn: '', name_en: '', phone: '', email: '', address: '', website: '', trade_license: '', logo_url: '' })
  const [businessEditable, setBusinessEditable] = useState(true)
  const [businessErrors, setBusinessErrors] = useState<BusinessValidationErrors>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('business_settings').select('*').maybeSingle()
    if (data) {
      // Merge rather than replace: a row saved before a column existed would
      // otherwise leave that field undefined and break the input bound to it.
      setBusiness(current => ({ ...current, ...data }))
      rememberBusinessBrand(data)
      setBusinessEditable(false)
    }
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
    toast.success(t('settings_businessSaved'))
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

  return (
    <Modal isOpen onClose={onClose} title={t('settings_tabBusiness')} size="lg">
              <div className="card">
                <h2 className="font-semibold text-slate-800 mb-4">{t('settings_tabBusiness')}</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label" htmlFor="settings-f1">{requiredLabel(t('settings_businessName'))}</label>
                    <input id="settings-f1"
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
                    <label className="label" htmlFor="settings-f2">{requiredLabel(t('settings_businessPhone1'))}</label>
                    <input id="settings-f2"
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
                    <label className="label" htmlFor="settings-f3">{t('settings_businessPhone2')}</label>
                    <input id="settings-f3"
                      type="text"
                      value={getBusinessPhones()[1]}
                      onChange={e => setBusinessPhone(1, e.target.value)}
                      className="input"
                      disabled={!businessEditable}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="settings-f4">{t('settings_businessEmail')}</label>
                    <input id="settings-f4"
                      type="email"
                      value={business.email || ''}
                      onChange={e => setBusiness({ ...business, email: e.target.value })}
                      className="input"
                      disabled={!businessEditable}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label" htmlFor="settings-f5">{requiredLabel(t('settings_businessAddress'))}</label>
                    <input id="settings-f5"
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
                    <label className="label" htmlFor="settings-f6">{t('settings_businessWebsite')}</label>
                    <input id="settings-f6"
                      type="text"
                      value={business.website || ''}
                      onChange={e => setBusiness({ ...business, website: e.target.value })}
                      className="input"
                      disabled={!businessEditable}
                    />
                  </div>
                  <div>
                    <label className="label">{t('settings_businessLogoUrl')}</label>
                    {/* An uploaded logo is stored inline as base64 - thousands of
                        characters. Shown as raw text it invites an accidental
                        keystroke that silently corrupts the image, and there is
                        nothing useful to read there anyway. A pasted URL is still
                        editable as before; only the uploaded form is summarised. */}
                    {String(business.logo_url || '').startsWith('data:') ? (
                      <div className="input flex items-center justify-between gap-2 bg-white text-slate-600">
                        <span className="truncate text-xs">
                          Uploaded image ({Math.round(business.logo_url.length / 1024)} KB)
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {businessEditable ? 'Replace it below' : 'Locked'}
                        </span>
                      </div>
                    ) : (
                      <input type="text" value={business.logo_url} onChange={e => setBusiness({ ...business, logo_url: e.target.value })} className="input" placeholder={t('settings_businessLogoPlaceholder')} disabled={!businessEditable} />
                    )}
                  </div>
                  <div>
                    <label className="label" htmlFor="settings-f7">{t('settings_businessUploadLogo')}</label>
                    <input id="settings-f7" type="file" accept="image/*" onChange={e => handleLogoUpload(e.target.files?.[0])} className="input" disabled={!businessEditable} />
                  </div>
                  {business.logo_url && (
                    <div className="col-span-3">
                      <img src={business.logo_url} alt="Business logo preview" className="h-20 max-w-48 object-contain border border-slate-200 rounded-lg bg-white p-2" />
                    </div>
                  )}
                  <div className="col-span-3 flex items-center gap-3">
                    {/* One action at a time: the form is read-only until Edit is
                        pressed, so there is never a Save sitting there that does
                        nothing. */}
                    {businessEditable ? (
                      <button onClick={saveBusiness} className="btn-primary">
                        <Save size={16} /> {t('common_save')}
                      </button>
                    ) : (
                      <button onClick={() => setBusinessEditable(true)} className="btn-primary" type="button">
                        <Pencil size={16} /> Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
    </Modal>
  )
}
