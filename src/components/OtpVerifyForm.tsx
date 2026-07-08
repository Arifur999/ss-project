import React, { useEffect, useRef, useState } from 'react'
import { MailCheck, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'

// ---------------------------------------------------------------------------
// Email OTP verification form.
//
// Rendered inside the Login/Register card after the backend answers with
// { needsEmailConfirmation: true }. The flow:
//   1. user types the 6-digit code that was emailed to them
//   2. verifyOtp() confirms it -> backend marks the email verified AND sets
//      the auth cookies, so a successful verify IS a successful login
//   3. onVerified() lets the parent page navigate wherever it wants
//
// The resend button starts a 60-second countdown that matches the server's
// cooldown, so the user always sees why the button is disabled.
// ---------------------------------------------------------------------------

const RESEND_COOLDOWN_SECONDS = 60
const OTP_LENGTH = 6

interface OtpVerifyFormProps {
  email: string          // the address the code was sent to (shown to the user)
  onVerified: () => void // called after a successful verification/login
  onBack?: () => void    // optional "use a different account" escape hatch
}

export default function OtpVerifyForm({ email, onVerified, onBack }: OtpVerifyFormProps) {
  const { verifyOtp, resendOtp } = useAuth()
  const { lang } = useLang()
  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  // Start the countdown immediately: a code was just sent by the backend.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const inputRef = useRef<HTMLInputElement>(null)

  // Tick the resend cooldown once per second until it reaches zero.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(current => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  // Focus the code input as soon as the form appears.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Bilingual copy without touching the locale JSON files.
  const copy = lang === 'bn'
    ? {
      title: 'ইমেইল ভেরিফিকেশন',
      sentTo: 'একটি ৬-সংখ্যার কোড পাঠানো হয়েছে',
      placeholder: '৬-সংখ্যার কোড',
      verify: 'ভেরিফাই করুন',
      verifying: 'যাচাই হচ্ছে...',
      resend: 'নতুন কোড পাঠান',
      resendIn: (s: number) => `নতুন কোড পাঠান (${s}s)`,
      back: 'অন্য অ্যাকাউন্ট ব্যবহার করুন',
      success: 'ইমেইল ভেরিফাই হয়েছে!',
      resent: 'নতুন কোড পাঠানো হয়েছে',
      invalid: 'সঠিক ৬-সংখ্যার কোড দিন',
    }
    : {
      title: 'Verify your email',
      sentTo: 'A 6-digit code was sent to',
      placeholder: '6-digit code',
      verify: 'Verify',
      verifying: 'Verifying...',
      resend: 'Resend code',
      resendIn: (s: number) => `Resend code (${s}s)`,
      back: 'Use a different account',
      success: 'Email verified!',
      resent: 'A new code has been sent',
      invalid: 'Please enter the 6-digit code',
    }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()

    // Client-side sanity check before hitting the server.
    if (otp.trim().length !== OTP_LENGTH) {
      toast.error(copy.invalid)
      return
    }

    setVerifying(true)
    try {
      const { error } = await verifyOtp(email, otp.trim())
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success(copy.success)
      onVerified()
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return

    setResending(true)
    try {
      const { error } = await resendOtp(email)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success(copy.resent)
      setOtp('')
      // Restart the countdown to mirror the server-side cooldown.
      setCooldown(RESEND_COOLDOWN_SECONDS)
      inputRef.current?.focus()
    } finally {
      setResending(false)
    }
  }

  return (
    <div>
      {/* Header: icon + which inbox the code went to */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-brand-green">
          <MailCheck size={26} />
        </div>
        <h2 className="text-xl font-semibold text-slate-800">{copy.title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {copy.sentTo} <span className="font-semibold text-slate-700">{email}</span>
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-4">
        {/* Big, centered, digits-only code input */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
          className="input text-center text-2xl font-bold tracking-[0.5em]"
          placeholder={copy.placeholder}
        />

        <button
          type="submit"
          disabled={verifying || otp.length !== OTP_LENGTH}
          className="w-full rounded-lg bg-brand-green py-2.5 font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {verifying ? copy.verifying : copy.verify}
        </button>
      </form>

      {/* Resend (with live countdown) + optional back link */}
      <div className="mt-5 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="flex items-center gap-1.5 font-semibold text-brand-green hover:text-green-700 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          <RotateCcw size={14} />
          {cooldown > 0 ? copy.resendIn(cooldown) : copy.resend}
        </button>

        {onBack && (
          <button type="button" onClick={onBack} className="text-slate-500 hover:text-slate-700">
            {copy.back}
          </button>
        )}
      </div>
    </div>
  )
}
