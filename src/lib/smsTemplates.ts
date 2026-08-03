// Saved SMS templates, shared between the Marketing composer and the Loan
// dashboard's "send SMS" action. Stored per-browser in localStorage; each
// template is identified by its campaign name.
//
// Also holds the shared SMS text helpers - segment counting and the invoice
// message builder - so the Marketing composer and the Sales page agree on what
// a message costs.
export type SmsTemplate = { name: string; message: string }

// Bangla / any non-ASCII text is billed at 70 chars/segment (unicode); plain
// English at 160. Mirrors the backend so the on-screen counter is accurate.
export function hasUnicode(text: string) {
  return [...text].some(ch => ch.charCodeAt(0) > 127)
}

export function segmentsFor(text: string) {
  if (!text) return 1
  if (hasUnicode(text)) return text.length <= 70 ? 1 : Math.ceil(text.length / 67)
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153)
}

export type InvoiceSmsInput = {
  /** Business name from Settings. */
  businessName: string
  /** Both business numbers, exactly as Settings stores them ("0171..., 0172..."). */
  businessPhone?: string
  businessAddress?: string
  invoiceNo: string
  date: string
  customerName: string
  subtotal: number
  discount: number
  grandTotal: number
  paid: number
  due: number
}

// Kept deliberately English and free of item lines: every 160 characters costs
// another credit per recipient, and Bangla would cost roughly three times as
// much for the same content.
// Same grouping the app shows on screen (formatCurr), so the figures in a
// message match the ones the customer sees on their invoice.
function smsAmount(value: number) {
  return Math.round(Number(value) || 0).toLocaleString('en-US')
}

function smsMoney(value: number) {
  return `Tk ${smsAmount(value)}`
}

export function buildInvoiceSms(input: InvoiceSmsInput): string {
  return [
    input.businessName,
    input.businessPhone,
    input.businessAddress,
    `Invoice: ${input.invoiceNo}`,
    `Date: ${input.date}`,
    `Customer: ${input.customerName}`,
    `Subtotal: ${smsMoney(input.subtotal)}`,
    `Discount: ${smsMoney(input.discount)}`,
    `Grand Total: ${smsMoney(input.grandTotal)}`,
    `Paid: ${smsMoney(input.paid)}`,
    `Due: ${smsMoney(input.due)}`,
    'Thank you!',
  ].filter(Boolean).join('\n')
}

export type DueSmsInput = {
  businessName: string
  /** Both business numbers, exactly as Settings stores them. */
  businessPhone?: string
  customerName: string
  /** Everything billed to this customer so far, net of discounts. */
  totalBill: number
  /** Everything they have paid so far. */
  paid: number
  due: number
}

// Payment reminder for one customer, in Bangla. Each recipient gets their own
// amounts, so the caller sends these one at a time rather than as a batch.
//
// Bangla is unicode, billed at 70 characters a segment instead of 160, so this
// costs about three credits per recipient - keep any edits tight.
export function buildDueSms(input: DueSmsInput): string {
  return [
    `আসসালামু আলাইকুম, ${input.customerName}!`,
    `${input.businessName} থেকে আপনার কেনাকাটা সম্পন্ন হয়েছে।`,
    `মোট বিল: ${smsAmount(input.totalBill)} টাকা`,
    `পরিশোধিত: ${smsAmount(input.paid)} টাকা`,
    `বকেয়া: ${smsAmount(input.due)} টাকা`,
    input.businessPhone ? `হেল্পলাইন: ${input.businessPhone}` : '',
    'ধন্যবাদ আমাদের সাথে থাকার জন্য!',
  ].filter(Boolean).join('\n')
}

const KEY = 'sms_templates_v2'
const LEGACY_KEY = 'sms_marketing_templates_v1' // old string[] of message bodies

export function readSmsTemplates(): SmsTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter(t => t && typeof t.name === 'string' && typeof t.message === 'string')
    }
    // One-time migration from the old message-only templates.
    const legacyRaw = localStorage.getItem(LEGACY_KEY)
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw)
      if (Array.isArray(legacy)) {
        const migrated: SmsTemplate[] = legacy
          .filter((m: any) => typeof m === 'string' && m.trim())
          .map((m: string) => ({ name: m.slice(0, 24) + (m.length > 24 ? '...' : ''), message: m }))
        if (migrated.length) writeSmsTemplates(migrated)
        return migrated
      }
    }
  } catch {
    // ignore malformed storage
  }
  return []
}

export function writeSmsTemplates(list: SmsTemplate[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)))
}

// Upsert by name (a repeat campaign name overwrites its old message).
export function saveSmsTemplate(name: string, message: string): SmsTemplate[] {
  const cleanName = name.trim()
  const cleanMsg = message.trim()
  const list = readSmsTemplates().filter(t => t.name.toLowerCase() !== cleanName.toLowerCase())
  const next = [{ name: cleanName, message: cleanMsg }, ...list]
  writeSmsTemplates(next)
  return next
}
