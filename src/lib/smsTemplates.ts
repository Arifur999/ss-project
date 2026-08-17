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

// Same grouping the app shows on screen (formatCurr), so the figures in a
// message match the ones the customer sees on their invoice.
//
// Both templates are Bangla, which is unicode and bills at 70 characters a
// segment instead of 160 - roughly three credits per recipient. Keep edits
// tight; every extra line costs money on each send.
function smsAmount(value: number) {
  return Math.round(Number(value) || 0).toLocaleString('en-US')
}

// Settings stores both business numbers as one "0171..., 0172..." string. Only
// the first goes out - a second number is just extra characters on every send.
function helplineNumber(phone?: string) {
  return String(phone || '').split(',')[0].trim()
}

// Sent right after a sale is saved: confirms the purchase and breaks down this
// one invoice. The outstanding-balance reminder is buildDueSms below - the two
// are deliberately different messages.
export function buildInvoiceSms(input: InvoiceSmsInput): string {
  const helpline = helplineNumber(input.businessPhone)
  return [
    `${input.businessName} থেকে আপনার কেনাকাটা সম্পন্ন হয়েছে।`,
    `ইনভয়েস নম্বর: ${input.invoiceNo}`,
    `মোট বিল: ${smsAmount(input.grandTotal)} টাকা`,
    `পরিশোধিত: ${smsAmount(input.paid)} টাকা`,
    `বকেয়া: ${smsAmount(input.due)} টাকা`,
    helpline ? `হেল্পলাইন: ${helpline}` : '',
    'ধন্যবাদ আমাদের সাথে থাকার জন্য!',
  ].filter(Boolean).join('\n')
}

export type DuePaymentSmsInput = {
  businessName: string
  businessPhone?: string
  /** What they just handed over. */
  paid: number
  /** What is still owed after this payment. */
  remainingDue: number
}

// Receipt sent after collecting money against an outstanding balance, so the
// customer has written confirmation of what was received and what is left.
//
// English, unlike the other two templates, at the owner's request. That also
// makes it cheaper: plain ASCII bills at 160 characters a segment where Bangla
// bills at 70. A Bangla business name would pull it back to unicode pricing.
export function buildDuePaymentSms(input: DuePaymentSmsInput): string {
  const helpline = helplineNumber(input.businessPhone)
  return [
    'Assalamu Alaikum,',
    `Payment received successfully at ${input.businessName}.`,
    `Paid Amount: Tk ${smsAmount(input.paid)}`,
    `Remaining Due: Tk ${smsAmount(input.remainingDue)}`,
    helpline ? `Helpline: ${helpline}` : '',
    'Thank you for your payment',
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

// Outstanding-balance reminder, in Bangla. This is the "please pay your due"
// message - it deliberately mentions ONLY the amount owed, no invoice lines.
// For the after-a-sale receipt use buildInvoiceSms instead.
//
// Bangla is unicode, billed at 70 characters a segment instead of 160, so keep
// any edits tight - each line costs credits.
export function buildDueSms(input: DueSmsInput): string {
  const helpline = helplineNumber(input.businessPhone)
  return [
    `আসসালামু আলাইকুম, ${input.customerName}!`,
    `${input.businessName}-এ আপনার বকেয়া টাকার পরিমাণ ${smsAmount(input.due)} টাকা। অনুগ্রহ করে দ্রুততম সময়ের মধ্যে বকেয়া পরিশোধ করার অনুরোধ করা হচ্ছে।`,
    helpline ? `হেল্পলাইন: ${helpline}` : '',
    'ধন্যবাদ!',
  ].filter(Boolean).join('\n')
}


/**
 * Templates are per user, not per browser.
 *
 * The key used to be a bare 'sms_templates_v2' shared by every account on the
 * machine, so two owners on one browser saw and overwrote each other's templates.
 * The unscoped key is still read once and migrated into the current user's key,
 * so nobody loses what they had written.
 */
const KEY_PREFIX = 'sms_templates_v2'
const SHARED_KEY = 'sms_templates_v2'
const LEGACY_KEY = 'sms_marketing_templates_v1' // old string[] of message bodies

let scopeId: string | undefined

/** Called once after login so every read and write below lands in this user's key. */
export function setSmsTemplateScope(userId?: string) {
  scopeId = userId || undefined
}

function templateKey() {
  return scopeId ? `${KEY_PREFIX}_${scopeId}` : KEY_PREFIX
}

export function readSmsTemplates(): SmsTemplate[] {
  const KEY = templateKey()
  try {
    let raw = localStorage.getItem(KEY)

    // First read for this user: adopt whatever is in the old shared key. Copied
    // rather than moved, because another account on this browser may not have
    // migrated yet and removing it would take their templates with it.
    if (!raw && KEY !== SHARED_KEY) {
      const shared = localStorage.getItem(SHARED_KEY)
      if (shared) {
        localStorage.setItem(KEY, shared)
        raw = shared
      }
    }
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
  localStorage.setItem(templateKey(), JSON.stringify(list.slice(0, 50)))
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
