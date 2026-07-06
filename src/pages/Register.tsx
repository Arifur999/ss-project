import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, Globe, Lock, Mail, MapPin, Phone, Send, Store, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { Lang, useLang } from '../context/LanguageContext'

const registerCopy = {
  en: {
    title: 'Business Registration',
    subtitle: 'Submit your business registration request to create your business workspace.',
    fullName: 'Full Name *',
    businessName: 'Business Name *',
    phone: 'Phone Number *',
    email: 'Email Address *',
    address: 'Address *',
    password: 'Password *',
    confirmPassword: 'Confirm Password *',
    bannerText: 'Your request will go to the super admin for approval.',
    submitBtn: 'Submit Registration Request',
    footerLink: 'Already have an account? Sign in',
  },
  bn: {
    title: 'ব্যবসা রেজিস্ট্রেশন',
    subtitle: 'আপনার বিজনেস ওয়ার্কস্পেস তৈরি করতে ব্যবসা রেজিস্ট্রেশন রিকোয়েস্ট সাবমিট করুন।',
    fullName: 'পূর্ণ নাম *',
    businessName: 'ব্যবসার নাম *',
    phone: 'ফোন নম্বর *',
    email: 'ইমেইল ঠিকানা *',
    address: 'ঠিকানা *',
    password: 'পাসওয়ার্ড *',
    confirmPassword: 'পাসওয়ার্ড নিশ্চিত করুন *',
    bannerText: 'আপনার অনুরোধটি অনুমোদনের জন্য সুপার অ্যাডমিনের কাছে যাবে।',
    submitBtn: 'রেজিস্ট্রেশন রিকোয়েস্ট সাবমিট করুন',
    footerLink: 'ইতিমধ্যে অ্যাকাউন্ট আছে? লগ ইন করুন',
  },
} satisfies Record<Lang, Record<string, string>>

const registerPlaceholders = {
  en: {
    fullName: 'Enter your full name',
    businessName: 'Enter your business name',
    phone: 'Enter your phone number',
    email: 'Enter your email address',
    address: 'Enter your business address',
    password: 'Enter your password',
    confirmPassword: 'Confirm your password',
  },
  bn: {
    fullName: 'আপনার পূর্ণ নাম লিখুন',
    businessName: 'আপনার ব্যবসার নাম লিখুন',
    phone: 'আপনার ফোন নম্বর লিখুন',
    email: 'আপনার ইমেইল ঠিকানা লিখুন',
    address: 'আপনার ব্যবসার ঠিকানা লিখুন',
    password: 'আপনার পাসওয়ার্ড লিখুন',
    confirmPassword: 'আপনার পাসওয়ার্ড নিশ্চিত করুন',
  },
} satisfies Record<Lang, Record<string, string>>

export default function Register() {
  const [form, setForm] = useState({
    fullName: '',
    businessName: '',
    phone: '',
    email: '',
    address: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { registerOwner } = useAuth()
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const regT = (key: keyof typeof registerCopy.en) => t(`register_${key}`, registerCopy[lang][key])
  const placeholderT = (key: keyof typeof registerPlaceholders.en) => t(`register_placeholder_${key}`, registerPlaceholders[lang][key])
  const footerText = regT('footerLink')
  const footerAction = lang === 'bn' ? 'লগ ইন করুন' : 'Sign in'
  const footerPrefix = footerText.replace(footerAction, '').trimEnd()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.fullName.trim() || !form.businessName.trim() || !form.phone.trim() || !form.email.trim() || !form.address.trim()) {
      toast.error('This field is required!')
      return
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const { error, needsEmailConfirmation } = await registerOwner({
        fullName: form.fullName.trim(),
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        password: form.password,
      })
      if (error) throw error

      if (needsEmailConfirmation) {
        toast.success('Registration created. Please confirm your email, then sign in.')
        navigate('/login')
      } else {
        toast.success('Registration request submitted. Admin approval required.')
        navigate('/choose-plan')
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#002a5c] via-[#003b7a] to-[#061a45] p-4">
      <div className="pointer-events-none absolute -left-20 bottom-16 h-72 w-72 rounded-full border border-blue-300/20" />
      <div className="pointer-events-none absolute -right-24 top-36 h-80 w-80 rounded-full border border-blue-300/20" />
      <div className="pointer-events-none absolute left-0 top-1/4 grid grid-cols-8 gap-4 opacity-30">
        {Array.from({ length: 40 }, (_, index) => <span key={index} className="h-1 w-1 rounded-full bg-blue-300" />)}
      </div>
      <div className="fixed top-4 right-4 flex items-center gap-1 bg-navy-700 rounded-lg p-0.5">
        <Globe size={13} className="text-slate-400 ml-1.5" />
        <button
          onClick={() => setLang('en')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${lang === 'en' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-white'}`}
        >
          EN
        </button>
        <button
          onClick={() => setLang('bn')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${lang === 'bn' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-white'}`}
        >
          বাংলা
        </button>
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="rounded-xl border border-white/50 bg-white p-4 shadow-2xl sm:p-5">
          <div className="mb-3 text-center">
            <h2 className="text-2xl font-black leading-tight text-slate-950 sm:text-[28px]">{regT('title')}</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
              {regT('subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <Field label={regT('fullName')} placeholder={placeholderT('fullName')} icon={<User size={16} />} value={form.fullName} onChange={value => updateField('fullName', value)} required />
            <Field label={regT('businessName')} placeholder={placeholderT('businessName')} icon={<Store size={16} />} value={form.businessName} onChange={value => updateField('businessName', value)} required />
            <Field label={regT('phone')} placeholder={placeholderT('phone')} icon={<Phone size={16} />} value={form.phone} onChange={value => updateField('phone', value)} required />
            <Field label={regT('email')} placeholder={placeholderT('email')} type="email" icon={<Mail size={16} />} value={form.email} onChange={value => updateField('email', value)} required />
            <TextAreaField label={regT('address')} placeholder={placeholderT('address')} icon={<MapPin size={16} />} value={form.address} onChange={value => updateField('address', value)} required />
            <PasswordField
              label={regT('password')}
              placeholder={placeholderT('password')}
              value={form.password}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              onChange={value => updateField('password', value)}
            />
            <PasswordField
              label={regT('confirmPassword')}
              placeholder={placeholderT('confirmPassword')}
              value={form.confirmPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              onChange={value => updateField('confirmPassword', value)}
            />

            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
              <CheckCircle2 className="flex-shrink-0 fill-emerald-600 text-white" size={20} />
              <span>{regT('bannerText')}</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {!loading && <Send size={18} className="fill-white/20" />}
              {loading ? t('common_pleaseWait') : regT('submitBtn')}
            </button>
          </form>

          <p className="mt-3 text-center text-xs text-slate-500">
            {footerPrefix} <Link to="/login" className="font-semibold text-brand-green hover:text-green-700">{footerAction}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function RequiredLabel({ label }: { label: string }) {
  return (
    <label className="mb-1 block text-xs font-bold text-slate-950">
      {label}
    </label>
  )
}

function Field({ label, placeholder, value, onChange, icon, type = 'text', required = false }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; icon: React.ReactNode; type?: string; required?: boolean }) {
  return (
    <div>
      <RequiredLabel label={label} />
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          required={required}
        />
      </div>
    </div>
  )
}

function TextAreaField({ label, placeholder, value, onChange, icon, required = false }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; icon: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <RequiredLabel label={label} />
      <div className="relative">
        <span className="absolute left-3 top-3 text-slate-500">{icon}</span>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="min-h-[64px] w-full resize-y rounded-md border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          required={required}
        />
      </div>
    </div>
  )
}

function PasswordField({ label, placeholder, value, onChange, showPassword, setShowPassword }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; showPassword: boolean; setShowPassword: (value: boolean) => void }) {
  return (
    <div>
      <RequiredLabel label={label} />
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-slate-300 bg-white pl-10 pr-10 text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}
