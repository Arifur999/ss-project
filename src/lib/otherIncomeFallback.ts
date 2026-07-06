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
