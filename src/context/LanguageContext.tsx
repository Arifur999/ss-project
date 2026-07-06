import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import en from '../locales/en.json'
import bn from '../locales/bn.json'

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
    const str = '৳' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    return lang === 'bn' ? toBnDigits(str) : str
  }, [lang])

  const monthName = useCallback((m: number): string => {
    const key = MONTH_KEYS[m - 1]
    return t(`month_${key}`)
  }, [t])

  const monthShort = useCallback((m: number): string => {
    const key = MONTH_KEYS[m - 1]
    return t(`month_short_${key}`)
  }, [t])

  const formatDateLong = useCallback((date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return ''
    const dayName = lang === 'bn' ? BN_WEEKDAYS[d.getDay()] : EN_WEEKDAYS[d.getDay()]
    const day = d.getDate()
    const mon = monthName(d.getMonth() + 1)
    const yr = d.getFullYear()
    if (lang === 'bn') return `${dayName}, ${toBnDigits(String(day))} ${mon}, ${toBnDigits(String(yr))}`
    return `${dayName}, ${day} ${mon}, ${yr}`
  }, [lang, monthName])

  const formatDateShort = useCallback((date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) return ''
    const day = String(d.getDate()).padStart(2, '0')
    const mon = String(d.getMonth() + 1).padStart(2, '0')
    const yr = d.getFullYear()
    const str = `${day}/${mon}/${yr}`
    return lang === 'bn' ? toBnDigits(str) : str
  }, [lang])

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
  }), [lang, t, formatNum, formatCurr, formatDateLong, formatDateShort, monthName, monthShort])

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
