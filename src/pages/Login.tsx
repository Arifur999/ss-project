import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Mail, Eye, EyeOff } from 'lucide-react'
import { SUBSCRIPTION_EXPIRED_LOGIN_MESSAGE, useAuth } from '../context/AuthContext'
import { Lang, useLang } from '../context/LanguageContext'
import toast from 'react-hot-toast'
import { useBusinessBrandName } from '../lib/businessBrand'
import OtpVerifyForm from '../components/OtpVerifyForm'
import AuthShell from '../components/AuthShell'

// Marketing copy for the left brand panel + the card welcome line. Kept close to
// the app's own voice (a furniture / retail business-management platform).
const panelCopy = {
  en: {
    heading: 'Manage your business with confidence.',
    subtitle: 'Sign in to track your sales, stock, accounts and customers — all in one place.',
    welcome: 'Welcome back! Please enter your details.',
    signIn: 'Sign in',
    newOwner: 'New owner?',
    register: 'Register as owner',
  },
  bn: {
    heading: 'আত্মবিশ্বাসের সাথে ব্যবসা পরিচালনা করুন।',
    subtitle: 'বিক্রি, স্টক, হিসাব ও কাস্টমার — সব এক জায়গায়। সাইন ইন করে শুরু করুন।',
    welcome: 'আবার স্বাগতম! আপনার তথ্য দিন।',
    signIn: 'সাইন ইন',
    newOwner: 'নতুন ব্যবহারকারী?',
    register: 'ওনার হিসেবে রেজিস্টার করুন',
  },
} satisfies Record<Lang, Record<string, string>>

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [subscriptionBlockMessage, setSubscriptionBlockMessage] = useState('')
  // When set, the card switches from the password form to the OTP form:
  // the account exists but its email was never verified, and the backend
  // has just sent a fresh 6-digit code to this address.
  const [otpEmail, setOtpEmail] = useState('')
  const { signIn } = useAuth()
  const { lang, setLang, t } = useLang()
  const businessName = useBusinessBrandName()
  const navigate = useNavigate()
  const copy = panelCopy[lang]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setSubscriptionBlockMessage('')
    try {
      const { error, needsEmailConfirmation, email: pendingEmail } = await signIn(email, password)
      if (error) throw error

      // Unverified account: switch this card to the OTP verification view.
      if (needsEmailConfirmation) {
        toast.success(lang === 'bn' ? 'আপনার ইমেইলে একটি কোড পাঠানো হয়েছে' : 'A verification code was sent to your email')
        setOtpEmail(pendingEmail || email)
        return
      }

      navigate('/')
    } catch (err: unknown) {
      const message = (err as Error).message || t('common_error')
      if (message === SUBSCRIPTION_EXPIRED_LOGIN_MESSAGE) {
        setSubscriptionBlockMessage(message)
      }
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      image="/auth-login.jpg"
      imageAlt={businessName}
      brandName={businessName}
      heading={copy.heading}
      subtitle={copy.subtitle}
      lang={lang}
      setLang={setLang}
    >
      {otpEmail ? (
        <OtpVerifyForm
          email={otpEmail}
          onVerified={() => navigate('/')}
          onBack={() => setOtpEmail('')}
        />
      ) : (
        <>
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-black text-white">
              {(businessName.trim()[0] || 'B').toUpperCase()}
            </div>
            <h2 className="text-2xl font-black text-slate-950">{t('login_title')}</h2>
            <p className="mt-1.5 text-sm text-slate-500">{copy.welcome}</p>
          </div>

          {subscriptionBlockMessage && (
            <div className="mb-4 rounded-xl border border-brand-blue/30 bg-brand-blue-soft px-3 py-3 text-sm font-medium text-brand-blue">
              {subscriptionBlockMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="login-f1">{t('login_emailAddress')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input id="login-f1"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input pl-9"
                  placeholder={t('login_emailPlaceholder')}
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="label" htmlFor="login-f2">{t('login_password')}</label>
                <Link to="/forgot-password" className="mb-1 text-xs font-semibold text-slate-500 hover:text-slate-900">
                  {lang === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot password?'}
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input id="login-f2"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pl-9 pr-9"
                  placeholder={t('login_passwordPlaceholder')}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-2.5 font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {loading ? t('common_pleaseWait') : copy.signIn}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {copy.newOwner} <Link to="/register" className="font-semibold text-slate-900 hover:text-slate-600">{copy.register}</Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}
