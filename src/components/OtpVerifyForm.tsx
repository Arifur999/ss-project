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
//   1. user types the 6-digit code that was emailed to them (one digit per
//      box, auto-advancing - see the segmented input below)
//   2. verifyOtp() confirms it -> backend marks the email verified AND sets
//      the auth cookies, so a successful verify IS a successful login
//   3. onVerified() lets the parent page navigate wherever it wants
//
// The resend button starts a 60-second countdown that matches the server's
// cooldown, so the user always sees why the button is disabled.
// ---------------------------------------------------------------------------

const RESEND_COOLDOWN_SECONDS = 60
const OTP_LENGTH = 6
const EMPTY_DIGITS = Array(OTP_LENGTH).fill('')

interface OtpVerifyFormProps {
  email: string          // the address the code was sent to (shown to the user)
  onVerified: () => void // called after a successful verification/login
  onBack?: () => void    // optional "use a different account" escape hatch
}

export default function OtpVerifyForm({ email, onVerified, onBack }: OtpVerifyFormProps) {
  const { verifyOtp, resendOtp } = useAuth()
  const { lang } = useLang()
  // One digit per box instead of a single free-text field - lets us
  // auto-advance focus, jump back on backspace, and auto-submit as soon as
  // the 6th digit lands (paste or type).
  const [digits, setDigits] = useState<string[]>(EMPTY_DIGITS)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  // Start the countdown immediately: a code was just sent by the backend.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const boxRefs = useRef<Array<HTMLInputElement | null>>([])
  const autoSubmittedRef = useRef(false)

  const code = digits.join('')

  // Tick the resend cooldown once per second until it reaches zero.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(current => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  // Focus the first box as soon as the form appears.
  useEffect(() => {
    boxRefs.current[0]?.focus()
  }, [])

  // Bilingual copy without touching the locale JSON files.
  const copy = lang === 'bn'
    ? {
      title: 'ইমেইল ভেরিফিকেশন',
      sentTo: 'একটি ৬-সংখ্যার কোড পাঠানো হয়েছে',
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
      verify: 'Verify',
      verifying: 'Verifying...',
      resend: 'Resend code',
      resendIn: (s: number) => `Resend code (${s}s)`,
      back: 'Use a different account',
      success: 'Email verified!',
      resent: 'A new code has been sent',
      invalid: 'Please enter the 6-digit code',
    }

  async function verifyCode(candidate: string) {
    if (candidate.length !== OTP_LENGTH || verifying) return

    setVerifying(true)
    try {
      const { error } = await verifyOtp(email, candidate)
      if (error) {
        toast.error(error.message)
        // Wrong code: clear the boxes and let the user retype from scratch.
        setDigits(EMPTY_DIGITS)
        autoSubmittedRef.current = false
        boxRefs.current[0]?.focus()
        return
      }
      toast.success(copy.success)
      onVerified()
    } finally {
      setVerifying(false)
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== OTP_LENGTH) {
      toast.error(copy.invalid)
      return
    }
    verifyCode(code)
  }

  // Auto-submit the instant all 6 boxes are filled (typed or pasted) - saves
  // an extra click, which matters a lot on a code that's only valid 5 minutes.
  useEffect(() => {
    if (code.length === OTP_LENGTH && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true
      verifyCode(code)
    }
    if (code.length < OTP_LENGTH) {
      autoSubmittedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  function setDigitAt(index: number, value: string) {
    setDigits(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function handleBoxChange(index: number, rawValue: string) {
    const digitsOnly = rawValue.replace(/\D/g, '')

    if (digitsOnly.length > 1) {
      // The user typed/pasted multiple characters into one box (common on
      // mobile keyboards with predictive text) - spread them across boxes
      // starting here, same as a clipboard paste.
      distributeAcrossBoxes(digitsOnly, index)
      return
    }

    setDigitAt(index, digitsOnly)
    if (digitsOnly && index < OTP_LENGTH - 1) {
      boxRefs.current[index + 1]?.focus()
    }
  }

  function distributeAcrossBoxes(value: string, startIndex: number) {
    setDigits(prev => {
      const next = [...prev]
      let cursor = startIndex
      for (const char of value) {
        if (cursor >= OTP_LENGTH) break
        next[cursor] = char
        cursor += 1
      }
      // Focus the box right after the last one we filled (or the last box).
      const focusIndex = Math.min(cursor, OTP_LENGTH - 1)
      requestAnimationFrame(() => boxRefs.current[focusIndex]?.focus())
      return next
    })
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!pasted) return
    e.preventDefault()
    distributeAcrossBoxes(pasted, 0)
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // Current box is already empty - jump back and clear the previous one
      // too, so Backspace reliably "eats" one digit per press.
      boxRefs.current[index - 1]?.focus()
      setDigitAt(index - 1, '')
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      boxRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      boxRefs.current[index + 1]?.focus()
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
      setDigits(EMPTY_DIGITS)
      autoSubmittedRef.current = false
      // Restart the countdown to mirror the server-side cooldown.
      setCooldown(RESEND_COOLDOWN_SECONDS)
      boxRefs.current[0]?.focus()
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

      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* Segmented 6-box code entry: auto-advances, supports paste, and
            auto-submits the moment all boxes are filled. */}
        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={el => { boxRefs.current[index] = el }}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={digit}
              disabled={verifying}
              onChange={e => handleBoxChange(index, e.target.value)}
              onKeyDown={e => handleKeyDown(index, e)}
              onFocus={e => e.target.select()}
              className={`h-12 w-11 rounded-lg border text-center text-xl font-bold text-slate-900 transition-colors focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30 disabled:opacity-50 sm:h-14 sm:w-12 ${
                digit ? 'border-brand-green bg-green-50' : 'border-slate-300 bg-white'
              }`}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={verifying || code.length !== OTP_LENGTH}
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
