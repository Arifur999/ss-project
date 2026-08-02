// Phone numbers the owner types in by hand on the Marketing page - people who
// are not customers, suppliers or employees in the system.
//
// These live in the `marketing_contacts` table once the API layer serves it.
// Until the backend carrying that endpoint is deployed they fall back to
// localStorage so the feature works right away, the same pattern Other Income
// and Loan lenders already use. On the first load after the endpoint appears,
// anything stored locally is pushed up and the browser copy is cleared.
import { supabase } from './supabase'
import { isMissingTableError } from './supabaseErrors'

// The data layer is a shim over our Express API (see lib/supabase.ts), so a
// table can be absent two ways: missing in the database, or not yet wired into
// the API's table map. Both mean the same thing here - fall back to the browser.
function isTableUnavailable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false
  if (isMissingTableError(error, TABLE)) return true
  const message = (error.message || '').toLowerCase()
  return message.includes('table not supported by api layer')
    || message.includes(`/${TABLE.replace(/_/g, '-')}`)
    || message.includes('404')
}

export type MarketingContact = {
  id: string
  name: string
  phone: string
  note: string
}

const TABLE = 'marketing_contacts'

function fallbackKey(userId?: string) {
  return `marketing_contacts_fallback_${userId || 'guest'}`
}

function readFallback(userId?: string): MarketingContact[] {
  try {
    return JSON.parse(localStorage.getItem(fallbackKey(userId)) || '[]')
  } catch {
    return []
  }
}

function writeFallback(userId: string | undefined, rows: MarketingContact[]) {
  localStorage.setItem(fallbackKey(userId), JSON.stringify(rows))
}

function toContact(row: any): MarketingContact {
  return {
    id: String(row.id),
    name: String(row.name || '').trim() || 'Unnamed',
    phone: String(row.phone || '').trim(),
    note: String(row.note || '').trim(),
  }
}

function sortContacts(rows: MarketingContact[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name))
}

export async function listMarketingContacts(userId?: string): Promise<MarketingContact[]> {
  const { data, error } = await supabase.from(TABLE).select('id, name, phone, note')

  if (error) {
    if (isTableUnavailable(error)) return sortContacts(readFallback(userId))
    throw error
  }

  // The table exists now - move anything left in the browser up to it once, so
  // numbers added before the table was created are not stranded.
  const pending = readFallback(userId)
  if (pending.length > 0) {
    const { error: pushError } = await supabase
      .from(TABLE)
      .insert(pending.map(row => ({ name: row.name, phone: row.phone, note: row.note })))
    if (!pushError) {
      writeFallback(userId, [])
      const retry = await supabase.from(TABLE).select('id, name, phone, note')
      if (!retry.error) return sortContacts((retry.data || []).map(toContact))
    }
  }

  return sortContacts((data || []).map(toContact))
}

export async function addMarketingContact(
  userId: string | undefined,
  input: { name: string; phone: string; note?: string }
): Promise<MarketingContact> {
  const payload = {
    name: input.name.trim(),
    phone: input.phone.trim(),
    note: (input.note || '').trim(),
  }

  const { data, error } = await supabase.from(TABLE).insert(payload).select('id, name, phone, note').maybeSingle()

  if (error) {
    if (!isTableUnavailable(error)) throw error
    const local: MarketingContact = { id: `local-${Date.now()}`, ...payload }
    writeFallback(userId, [...readFallback(userId), local])
    return local
  }

  if (!data) throw new Error('Failed to save contact')
  return toContact(data)
}

export async function deleteMarketingContact(userId: string | undefined, id: string): Promise<void> {
  if (id.startsWith('local-')) {
    writeFallback(userId, readFallback(userId).filter(row => row.id !== id))
    return
  }

  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error && !isTableUnavailable(error)) throw error
  writeFallback(userId, readFallback(userId).filter(row => row.id !== id))
}
