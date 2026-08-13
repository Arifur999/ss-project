import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyeIcon as Eye, EyeSlashIcon as EyeOff, LockIcon as Lock, EnvelopeSimpleIcon as Mail, ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import { Lang, useLang } from '../context/LanguageContext'
import { useBusinessBrandName } from '../lib/businessBrand'
import { forgotPassword, resetPassword } from '../services/admin.services'
import AuthShell from '../components/AuthShell'

const copy = {
  en: {
    heading: 'Reset your password securely.',
    subtitle: "Enter your email and we'll send a 6-digit code to set a new password.",
    emailTitle: 'Forgot password',
    emailHint: "Enter your account email — we'll email you a reset code.",
    resetTitle: 'Set a new password',
    resetHint: 'Enter the 6-digit code we emailed you and your new password.',
    email: 'Email address',
    code: 'Reset code',
    newPass: 'New password',
    confirmPass: 'Confirm password',
    sendCode: 'Send reset code',
    resetBtn: 'Reset password',
    backToLogin: 'Back to sign in',
    resend: 'Resend code',
  },
  bn: {
    heading: 'নিরাপদে পাসওয়ার্ড রিসেট করুন।',
    subtitle: 'ইমেইল দিন — নতুন পাসওয়ার্ড সেট করতে ৬-সংখ্যার কোড পাঠাব।',
    emailTitle: 'পাসওয়ার্ড ভুলে গেছেন',
    emailHint: 'আপনার অ্যাকাউন্টের ইমেইল দিন — রিসেট কোড পাঠানো হবে।',
    resetTitle: 'নতুন পাসওয়ার্ড দিন',
    resetHint: 'ইমেইলে পাঠানো ৬-সংখ্যার কোড ও নতুন পাসওয়ার্ড দিন।',
    email: 'ইমেইল ঠিকানা',
    code: 'রিসেট কোড',
    newPass: 'নতুন পাসওয়ার্ড',
    confirmPass: 'পাসওয়ার্ড নিশ্চিত করুন',
    sendCode: 'রিসেট কোড পাঠাও',
    resetBtn: 'পাসওয়ার্ড রিসেট',
    backToLogin: 'সাইন ইন-এ ফিরুন',
    resend: 'আবার কোড পাঠাও',
  },
} satisfies Record<Lang, Record<string, string>>

export default function ForgotPassword() {
  const { lang, setLang } = useLang()
  const businessName = useBusinessBrandName()
  const navigate = useNavigate()
  const t = copy[lang]

  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return toast.error(t.email)
    setLoading(true)
    try {
      const result = await forgotPassword(email.trim())
      toast.success(result.message)
      setStep('reset')
    } catch (err: any) {
      toast.error(err.message || 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault()
    if (otp.trim().length !== 6) return toast.error(lang === 'bn' ? '৬-সংখ্যার কোড দিন' : 'Enter the 6-digit code')
    if (password.length < 6) return toast.error(lang === 'bn' ? 'পাসওয়ার্ড অন্তত ৬ অক্ষর' : 'Password must be at least 6 characters')
    if (password !== confirm) return toast.error(lang === 'bn' ? 'পাসওয়ার্ড মিলছে না' : 'Passwords do not match')
    setLoading(true)
    try {
      const result = await resetPassword(email.trim(), otp.trim(), password)
      toast.success(result.message)
      navigate('/login')
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      image="/auth-login.jpg"
      imageAlt={businessName}
      brandName={businessName}
      heading={t.heading}
      subtitle={t.subtitle}
      lang={lang}
      setLang={setLang}
    >
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
          <ShieldCheck size={22} />
        </div>
        <h2 className="text-2xl font-black text-slate-950">{step === 'email' ? t.emailTitle : t.resetTitle}</h2>
        <p className="mt-1.5 text-sm text-slate-500">{step === 'email' ? t.emailHint : t.resetHint}</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <label className="label" htmlFor="forgot-password-f1">{t.email}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input id="forgot-password-f1" type="email" value={email} onChange={e => setEmail(e.target.value)} className="input pl-9" placeholder="you@example.com" required />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-slate-900 py-2.5 font-semibold text-white transition-colors hover:bg-black disabled:opacity-50">
            {loading ? '...' : t.sendCode}
          </button>
        </form>
      ) : (
        <form onSubmit={submitReset} className="space-y-4">
          <div>
            <label className="label" htmlFor="forgot-password-f2">{t.code}</label>
            <input id="forgot-password-f2"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              className="input text-center text-lg font-bold tracking-[0.4em]"
              placeholder="------"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="forgot-password-f3">{t.newPass}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input id="forgot-password-f3" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input pl-9 pr-9" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="forgot-password-f4">{t.confirmPass}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input id="forgot-password-f4" type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} className="input pl-9" required />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-slate-900 py-2.5 font-semibold text-white transition-colors hover:bg-black disabled:opacity-50">
            {loading ? '...' : t.resetBtn}
          </button>
          <button type="button" onClick={sendCode} disabled={loading} className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800">
            {t.resend}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-semibold text-slate-900 hover:text-slate-600">{t.backToLogin}</Link>
      </p>
    </AuthShell>
  )
}
