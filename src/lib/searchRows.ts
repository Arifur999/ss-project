/**
 * Free-text search across a handful of fields on a row.
 *
 * Every list in this app is read by somebody looking for one receipt among
 * hundreds, and they arrive knowing a name, a phone number or an amount -
 * never which column it lives in. So the query is matched against all of them
 * at once, and every word has to appear somewhere: typing "khadiza cash"
 * narrows, rather than widening to every row with either word.
 */

const normalise = (value: unknown): string => String(value ?? '').toLowerCase()

export function rowMatches<T>(row: T, fields: ((row: T) => unknown)[], query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  // Digits typed as "30,500" or "30500" should both find Tk 30,500, so the
  // separators come out of the haystack as well as the needle.
  const haystack = fields.map(pick => normalise(pick(row))).join(' ')
  const bare = haystack.replace(/[,\s]/g, '')
  return words.every(word => haystack.includes(word) || bare.includes(word.replace(/[,\s]/g, '')))
}

export function filterRows<T>(rows: T[], fields: ((row: T) => unknown)[], query: string): T[] {
  if (!query.trim()) return rows
  return rows.filter(row => rowMatches(row, fields, query))
}
