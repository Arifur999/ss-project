/**
 * Other Income rows that were stranded in a browser, and getting them out.
 *
 * The `/other-incomes` endpoint exists and works, so nothing should be written
 * here any more - and nothing is. But this fallback ran for a while, and while it
 * did, saving a row wrote it to localStorage and showed a green "Other income
 * saved". Those rows then fed the Monthly Report, the Yearly Report, the Report
 * Summary and the Shareholder Dashboard as if they were real income, so the
 * office desktop and the shop tablet reported different profit for the same
 * month.
 *
 * They are real money the owner entered, so they are pushed up to the server on
 * the next load of the Other Income page rather than dropped - the same
 * push-up-then-clear pattern lib/marketingContacts.ts uses. Once a browser has
 * been through that once, its copy is empty and stays empty.
 */
import { supabase } from './supabase'

export type OtherIncomeFallbackRow = {
  id: string
  date: string
  income_type: 'supplier' | 'other'
  supplier_id: string | null
  supplier_name: string
  source_name: string
  amount: number
  account_id: string
  account_name: string
  notes: string
}

function fallbackKey(userId?: string) {
  return `other_incomes_fallback_${userId || 'guest'}`
}

export function readOtherIncomeFallbackRows(userId?: string): OtherIncomeFallbackRow[] {
  try {
    return JSON.parse(localStorage.getItem(fallbackKey(userId)) || '[]')
  } catch {
    return []
  }
}

export function writeOtherIncomeFallbackRows(userId: string | undefined, nextRows: OtherIncomeFallbackRow[]) {
  localStorage.setItem(fallbackKey(userId), JSON.stringify(nextRows))
}

export function sortOtherIncomeRows(rows: OtherIncomeFallbackRow[]) {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

/**
 * Move anything left in this browser up to the server, once.
 *
 * Returns true if it pushed rows, so the caller knows to reload. The browser copy
 * is cleared only after the insert succeeds - if it fails the rows stay put and
 * the next load tries again, which is the safe direction to fail in.
 *
 * Local ids are dropped: the server issues real ones. `created_by` is left to the
 * server too, the same as a normal save.
 */
export async function migrateOtherIncomeFallbackRows(userId?: string): Promise<boolean> {
  const pending = readOtherIncomeFallbackRows(userId)
  if (pending.length === 0) return false

  const { error } = await supabase.from('other_incomes').insert(
    pending.map(({ id: _localId, ...row }) => ({ ...row, amount: Number(row.amount || 0) }))
  )
  if (error) return false

  writeOtherIncomeFallbackRows(userId, [])
  return true
}
