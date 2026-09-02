/**
 * Loan lenders that were stranded in a browser, and getting them out.
 *
 * The `/loan-lenders` endpoint exists and works, so nothing is written here any
 * more. While the fallback was live three things went wrong at once:
 *
 *   - The "table is missing" test was `error.message.includes('loan_lenders')`,
 *     which matches any error that merely names the table - a foreign key
 *     violation, a validation failure, a permission error. All of them diverted
 *     the save into localStorage and showed a green "Bank / Person saved".
 *   - Worse, a server response with no error but no row also wrote locally and
 *     reported success.
 *   - Unlike every other fallback in the app there was no push-up, so rows
 *     merged in from the browser forever and never reached Postgres.
 *
 * The key is global rather than per-user, so two owners sharing one browser could
 * see each other's lenders. That is why migration filters on the `owner_id` each
 * row was saved with: rows belonging to somebody else are left where they are
 * rather than handed to whoever logs in first.
 */
import { supabase } from '../../lib/supabase'

const STORAGE_KEY = 'loan_lenders_fallback'

/**
 * Whether the loan_lenders table is genuinely absent.
 *
 * Deliberately narrow. The old version matched any message containing
 * 'loan_lenders', which is most of them.
 */
export function isLoanLenderTableMissing(error?: { message?: string } | null) {
  const message = String(error?.message || '').toLowerCase()
  if (!message) return false
  return (
    message.includes('table not supported by api layer') ||
    message.includes('does not exist') ||
    message.includes('relation "loan_lenders"') ||
    message.includes('404')
  )
}

export function getStoredLoanLenders() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function setStoredLoanLenders(lenders: any[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lenders))
}

export function saveStoredLoanLender(form: any, editItem?: any) {
  const stored = getStoredLoanLenders()
  const now = new Date().toISOString()
  const key = (editItem?.name || form.name).trim().toLowerCase()
  const lender = {
    ...form,
    id: editItem?.id?.startsWith?.('local:') ? editItem.id : `local:${Date.now()}`,
    // The form no longer asks for a type. "person" is what the database
    // column defaults to, so a lender saved offline reads back the same as one
    // saved through the API.
    lender_type: form.lender_type || 'person',
    created_at: editItem?.created_at || now,
  }
  const exists = stored.some((item: any) => item.id === editItem?.id || item.name.trim().toLowerCase() === key)
  const next = exists
    ? stored.map((item: any) => item.id === editItem?.id || item.name.trim().toLowerCase() === key ? lender : item)
    : [lender, ...stored]

  setStoredLoanLenders(next)

  return lender
}

/**
 * Move this owner's stranded lenders up to the server, once.
 *
 * Returns the number pushed, so the caller knows whether to reload and tell the
 * operator. Only rows whose stored `owner_id` matches - plus rows saved before
 * owner_id was recorded, which can only have come from this browser's single
 * account - are touched. Anything belonging to another owner is left alone, since
 * the storage key is shared across accounts on the same browser.
 *
 * Rows are removed from the browser one at a time, as each insert succeeds, so a
 * failure part-way through neither loses the rest nor duplicates what already
 * went up.
 */
export async function migrateStoredLoanLenders(ownerId?: string): Promise<number> {
  const stored = getStoredLoanLenders()
  if (stored.length === 0 || !ownerId) return 0

  const mine = stored.filter((lender: any) => !lender.owner_id || lender.owner_id === ownerId)
  if (mine.length === 0) return 0

  let pushed = 0
  for (const lender of mine) {
    // The server issues the id, created_at and created_by.
    const { id: _localId, created_at: _createdAt, created_by: _createdBy, ...payload } = lender
    const { error } = await supabase.from('loan_lenders').insert({ ...payload, owner_id: ownerId })
    if (error) break

    setStoredLoanLenders(getStoredLoanLenders().filter((row: any) => row.id !== lender.id))
    pushed += 1
  }

  return pushed
}

export function deleteStoredLoanLender(item: any) {
  const itemKey = String(item.name || '').trim().toLowerCase()
  setStoredLoanLenders(getStoredLoanLenders().filter((lender: any) => {
    if (lender.id === item.id) return false
    return String(lender.name || '').trim().toLowerCase() !== itemKey
  }))
}

export function mergeStoredAndLoanLenders(lenders: any[], activeOnly = false) {
  const byName: Record<string, any> = {}

  lenders.forEach(lender => {
    if (activeOnly && lender.is_active === false) return
    const name = String(lender.name || '').trim()
    if (!name) return
    byName[name.toLowerCase()] = lender
  })

  getStoredLoanLenders().forEach((lender: any) => {
    if (activeOnly && lender.is_active === false) return
    const name = String(lender.name || '').trim()
    if (!name) return
    if (!byName[name.toLowerCase()]) {
      byName[name.toLowerCase()] = lender
    }
  })

  return Object.values(byName).sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')))
}

export function mergeStoredAndLegacyLoanLenders(loans: any[], activeOnly = false) {
  const byName: Record<string, any> = {}

  loans.forEach(loan => {
    const name = loan.lender_name || loan.loan_lenders?.name
    if (!name) return
    const key = name.trim().toLowerCase()
    if (!byName[key]) {
      byName[key] = {
        id: `legacy:${key}`,
        name,
        lender_type: loan.loan_type === 'bank' ? 'bank' : 'person',
        phone: '',
        address: '',
        opening_balance: 0,
        notes: '',
        is_active: true,
        created_at: loan.created_at,
      }
    }
  })

  getStoredLoanLenders().forEach((lender: any) => {
    if (!activeOnly || lender.is_active !== false) {
      byName[lender.name.trim().toLowerCase()] = lender
    }
  })

  return Object.values(byName).sort((a: any, b: any) => a.name.localeCompare(b.name))
}
