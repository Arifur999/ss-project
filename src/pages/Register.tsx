import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyeIcon as Eye, EyeSlashIcon as EyeOff, LockIcon as Lock, EnvelopeSimpleIcon as Mail, MapPinIcon as MapPin, PhoneIcon as Phone, PaperPlaneTiltIcon as Send, StorefrontIcon as Store, UserIcon as User } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { Lang, useLang } from '../context/LanguageContext'
import { useBusinessBrandName } from '../lib/businessBrand'
import OtpVerifyForm from '../components/OtpVerifyForm'
import AuthShell from '../components/AuthShell'

// Marketing copy for the left brand panel of the registration screen.
const panelCopy = {
  en: {
    heading: 'Grow your business, beautifully organised.',
    subtitle: 'Create your workspace to manage inventory, sales, accounts and customers effortlessly.',
  },
  bn: {
    heading: 'সুন্দরভাবে সাজানো, আপনার ব্যবসার প্রবৃদ্ধি।',
    subtitle: 'স্টক, বিক্রি, হিসাব ও কাস্টমার সহজে পরিচালনা করতে আপনার ওয়ার্কস্পেস তৈরি করুন।',
  },
} satisfies Record<Lang, Record<string, string>>

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
    submitBtn: 'রেজিস্ট্রেশন রিকোয়েস্ট সাবমিট করুন',
    footerLink: 'ইতিমধ্যে অ্যাকাউন্ট আছে? লগ ইন করুন',
  },
} satisfies Record<Lang, Record<string, string>>

const registerPlaceholders = {
  en: {
    fullName: 'Full name',
    businessName: 'Business name',
    phone: 'Phone number',
    email: 'Email address',
    address: 'Enter your business address',
    password: 'Enter your password',
    confirmPassword: 'Confirm your password',
  },
  bn: {
    fullName: 'পূর্ণ নাম',
    businessName: 'ব্যবসার নাম',
    phone: 'ফোন নম্বর',
    email: 'ইমেইল ঠিকানা',
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
  // When set, the card switches to the OTP verification step: the account
  // was created and a 6-digit code has been emailed to this address.
  const [otpEmail, setOtpEmail] = useState('')
  const { registerOwner } = useAuth()
  const { lang, setLang, t } = useLang()
  const businessName = useBusinessBrandName()
  const navigate = useNavigate()
  const copy = panelCopy[lang]
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
      const { error, needsEmailConfirmation, email: pendingEmail } = await registerOwner({
        fullName: form.fullName.trim(),
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        password: form.password,
      })
      if (error) throw error

      if (needsEmailConfirmation) {
        // Account created - now the user must type the emailed 6-digit code.
        // We stay on this page and swap the form for the OTP step.
        toast.success(lang === 'bn' ? 'আপনার ইমেইলে একটি কোড পাঠানো হয়েছে' : 'A verification code was sent to your email')
        setOtpEmail(pendingEmail || form.email.trim())
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
    <AuthShell
      image="/auth-register.jpg"
      imageAlt={businessName}
      brandName={businessName}
      heading={copy.heading}
      subtitle={copy.subtitle}
      lang={lang}
      setLang={setLang}
    >
      {/* Step 2 of registration: the account exists, now confirm the
          emailed 6-digit code. Verifying also logs the new owner in,
          after which they land on the plan selection page. */}
      {otpEmail ? (
        <OtpVerifyForm
          email={otpEmail}
          onVerified={() => navigate('/choose-plan')}
        />
      ) : (
      <>
          <div className="mb-5 text-center">
            <h2 className="text-2xl font-black leading-tight text-slate-950">{regT('title')}</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
              {regT('subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={regT('fullName')} placeholder={placeholderT('fullName')} icon={<User size={16} />} value={form.fullName} onChange={value => updateField('fullName', value)} required />
              <Field label={regT('businessName')} placeholder={placeholderT('businessName')} icon={<Store size={16} />} value={form.businessName} onChange={value => updateField('businessName', value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={regT('phone')} placeholder={placeholderT('phone')} icon={<Phone size={16} />} value={form.phone} onChange={value => updateField('phone', value)} required />
              <Field label={regT('email')} placeholder={placeholderT('email')} type="email" icon={<Mail size={16} />} value={form.email} onChange={value => updateField('email', value)} required />
            </div>
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

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/20 transition-colors hover:bg-black disabled:opacity-50"
            >
              {!loading && <Send size={18} className="fill-white/20" />}
              {loading ? t('common_pleaseWait') : regT('submitBtn')}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            {footerPrefix} <Link to="/login" className="font-semibold text-slate-900 hover:text-slate-600">{footerAction}</Link>
          </p>
      </>
      )}
    </AuthShell>
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
          className="h-12 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/15"
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
          className="min-h-[72px] w-full resize-y rounded-md border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/15"
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
          className="h-12 w-full rounded-md border border-slate-300 bg-white pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/15"
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
