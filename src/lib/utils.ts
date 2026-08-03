import { format } from 'date-fns'

// The single date format used everywhere in the app: 30-Jan-2026.
// Every screen, table, print-out and PDF must go through this - never
// toLocaleDateString, which renders differently per browser locale.
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return ''
  const parsed = new Date(date)
  if (isNaN(parsed.getTime())) return ''
  return format(parsed, 'dd-MMM-yyyy')
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-BD')
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export const MONTHS_BN = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
]

export function generateInvoiceNo(): string {
  const d = new Date()
  const yy = d.getFullYear().toString().slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `INV-${yy}${mm}-${rand}`
}

export function generateSINo(): string {
  const d = new Date()
  const yy = d.getFullYear().toString().slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `PO-${yy}${mm}-${rand}`
}

export function generateProductCode(): string {
  const rand = Math.floor(Math.random() * 90000) + 10000
  return `FRN-${rand}`
}
