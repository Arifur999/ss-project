// The filtering, ordering and slicing the API layer applies in the browser.
//
// Lifted out of supabase.ts unchanged so it can be tested directly. It is the
// reference for what a query means in this app: every page's numbers come out
// of these rules, so anything moved to the server has to agree with them, and
// queryEngine.test.ts is what proves it still does.
//
// The rules are JavaScript's, not SQL's, and the differences matter:
//   - eq is strict (===), so 1 and '1' are different values
//   - ilike drops every % and does a case-insensitive "contains"
//   - is null also matches undefined
//   - comparisons are JS comparisons, so a string column sorts as text
// Postgres does none of these quite the same way, which is why server-side
// filtering may only ever narrow a result set - never decide it.

export type Row = Record<string, any>

export type Filter =
  | { kind: 'eq'; column: string; value: any }
  | { kind: 'neq'; column: string; value: any }
  | { kind: 'in'; column: string; values: any[] }
  | { kind: 'gt' | 'gte' | 'lt' | 'lte'; column: string; value: any }
  | { kind: 'is'; column: string; value: any }
  | { kind: 'not_is'; column: string; value: any }
  | { kind: 'ilike'; column: string; pattern: string }

export type Order = { column: string; ascending: boolean }

export const matchesFilter = (row: Row, filter: Filter): boolean => {
  const value = row?.[filter.column]
  switch (filter.kind) {
    case 'eq': return value === filter.value
    case 'neq': return value !== filter.value
    case 'in': return filter.values.includes(value)
    case 'gt': return value > filter.value
    case 'gte': return value >= filter.value
    case 'lt': return value < filter.value
    case 'lte': return value <= filter.value
    case 'is': return filter.value === null ? value === null || value === undefined : value === filter.value
    case 'not_is': return filter.value === null ? value !== null && value !== undefined : value !== filter.value
    case 'ilike': {
      const pattern = filter.pattern.replace(/%/g, '')
      return String(value ?? '').toLowerCase().includes(pattern.toLowerCase())
    }
    default: return true
  }
}

export const applyFilters = (rows: Row[], filters: Filter[]) =>
  rows.filter((row) => filters.every((f) => matchesFilter(row, f)))

export const applyOrder = (rows: Row[], orders: Order[]) => {
  if (orders.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const av = a?.[order.column]
      const bv = b?.[order.column]
      if (av === bv) continue
      const compare = av > bv ? 1 : -1
      return order.ascending ? compare : -compare
    }
    return 0
  })
}

// `from` and `to` are both inclusive, matching the range() the pages call.
export const applyRange = (rows: Row[], rangeFrom?: number, limitCount?: number) => {
  if (rangeFrom === undefined && limitCount === undefined) return rows
  return rows.slice(rangeFrom ?? 0, limitCount)
}
