import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Mail, Eye, EyeOff, Globe } from 'lucide-react'
import { SUBSCRIPTION_EXPIRED_LOGIN_MESSAGE, useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import toast from 'react-hot-toast'
import { useBusinessBrandName } from '../lib/businessBrand'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [subscriptionBlockMessage, setSubscriptionBlockMessage] = useState('')
  const { signIn } = useAuth()
  const { lang, setLang, t } = useLang()
  const businessName = useBusinessBrandName()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setSubscriptionBlockMessage('')
    try {
      const { error } = await signIn(email, password)
      if (error) throw error
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
    <div className="min-h-screen bg-gradient-to-br from-navy-900 to-navy-800 flex items-center justify-center p-4">
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

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-green rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{businessName}</h1>
          <p className="text-slate-400 text-sm mt-1">{t('appSubtitle')}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">{t('login_title')}</h2>

          {subscriptionBlockMessage && (
            <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-3 text-sm font-medium text-orange-700">
              {subscriptionBlockMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{t('login_emailAddress')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
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
              <label className="label">{t('login_password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-green hover:bg-green-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? t('common_pleaseWait') : t('login_title')}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            New owner? <Link to="/register" className="font-semibold text-brand-green hover:text-green-700">Register as owner</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
