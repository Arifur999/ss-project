import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import en from '../locales/en.json'
import bn from '../locales/bn.json'
import { formatDate } from '../lib/utils'

export type Lang = 'en' | 'bn'

const locales: Record<Lang, Record<string, string>> = { en, bn }

interface LangContextType {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, fallback?: string) => string
  formatNum: (n: number) => string
  formatCurr: (n: number) => string
  formatDateLong: (date: string | Date) => string
  formatDateShort: (date: string | Date) => string
  monthName: (m: number) => string      // 1-based
  monthShort: (m: number) => string     // 1-based
}

const LangContext = createContext<LangContextType | null>(null)

const BN_DIGITS: Record<string, string> = {
  '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
  '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
}

function toBnDigits(str: string): string {
  return str.replace(/[0-9]/g, d => BN_DIGITS[d])
}

const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
const BN_WEEKDAYS = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার']
const EN_WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem('app_lang') as Lang) || 'bn'
  })

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem('app_lang', l)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'app_lang' && (event.newValue === 'en' || event.newValue === 'bn')) {
        setLangState(event.newValue)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [lang])

  const t = useCallback((key: string, fallback?: string): string => {
    return locales[lang][key] ?? locales['en'][key] ?? fallback ?? key
  }, [lang])

  const formatNum = useCallback((n: number): string => {
    const str = n.toLocaleString('en-US')
    return lang === 'bn' ? toBnDigits(str) : str
  }, [lang])

  const formatCurr = useCallback((n: number): string => {
    // Guard the input: a null/undefined amount used to throw here and blank
    // the entire page rather than show a zero in one cell.
    const safe = Number(n)
    const amount = (Number.isFinite(safe) ? safe : 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    // "৳" is a Bengali-script glyph and looks out of place inside English
    // text, so use it only in Bangla; English uses the "Tk" abbreviation.
    // A non-breaking space (U+00A0) between "Tk" and the number stops the
    // amount from wrapping onto two lines in narrow table cells site-wide.
    return lang === 'bn' ? '৳' + toBnDigits(amount) : 'Tk\u00A0' + amount
  }, [lang])

  const monthName = useCallback((m: number): string => {
    const key = MONTH_KEYS[m - 1]
    return t(`month_${key}`)
  }, [t])

  const monthShort = useCallback((m: number): string => {
    const key = MONTH_KEYS[m - 1]
    return t(`month_short_${key}`)
  }, [t])

  // Both date helpers render the app-wide 30-Jan-2026 format; the "long" one
  // only prefixes the weekday. Bangla keeps the same shape with Bangla digits.
  const formatDateShort = useCallback((date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    if (!d || isNaN(d.getTime())) return ''
    const str = formatDate(d)
    return lang === 'bn' ? toBnDigits(str) : str
  }, [lang])

  const formatDateLong = useCallback((date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    if (!d || isNaN(d.getTime())) return ''
    const dayName = lang === 'bn' ? BN_WEEKDAYS[d.getDay()] : EN_WEEKDAYS[d.getDay()]
    return `${dayName}, ${formatDateShort(d)}`
  }, [lang, formatDateShort])

  const value = useMemo(() => ({
    lang,
    setLang,
    t,
    formatNum,
    formatCurr,
    formatDateLong,
    formatDateShort,
    monthName,
    monthShort,
  }), [lang, setLang, t, formatNum, formatCurr, formatDateLong, formatDateShort, monthName, monthShort])

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LanguageProvider')
  return ctx
}

// Legacy export for pages still using t.xxx object pattern — will be removed after full migration
export type Translations = Record<string, string>
export const MONTHS_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const
