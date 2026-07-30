// Saved SMS templates, shared between the Marketing composer and the Loan
// dashboard's "send SMS" action. Stored per-browser in localStorage; each
// template is identified by its campaign name.
export type SmsTemplate = { name: string; message: string }

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
