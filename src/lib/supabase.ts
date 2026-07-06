/* eslint-disable @typescript-eslint/no-explicit-any */
// Supabase-compatible data layer backed by our Express API.
//
// The original app talked to Supabase directly from every page:
//   const { data, error } = await supabase.from('sales').select('*').eq(...)
// To keep all page/UI code untouched, this module re-implements the small
// subset of the supabase-js query builder the app actually uses and routes
// it to the REST backend. Complex transactional flows (sale save, purchase
// receive, FIFO) do NOT go through here - pages call the services directly.

import { api } from './httpClient'
import { consumeRecycleMeta } from './recycleBin'

type Row = Record<string, any>

interface TableConfig {
  list: string            // GET endpoint returning all rows for this owner
  create?: string         // POST endpoint (single row)
  update?: (id: string) => string  // PATCH endpoint
  remove?: (id: string) => string  // DELETE endpoint
  upsertPut?: string      // PUT endpoint for upsert-style tables
  flattenFrom?: { list: string; key: string } // derive rows from a parent list
}

const TABLES: Record<string, TableConfig> = {
  business_settings: { list: '/business-settings', upsertPut: '/business-settings' },
  shareholders: { list: '/shareholders', create: '/shareholders', update: (id) => `/shareholders/${id}`, remove: (id) => `/shareholders/${id}` },
  accounts: { list: '/accounts', create: '/accounts', update: (id) => `/accounts/${id}`, remove: (id) => `/accounts/${id}` },
  account_transfers: { list: '/account-transfers', create: '/account-transfers', remove: (id) => `/account-transfers/${id}` },
  monthly_targets: { list: '/monthly-targets', upsertPut: '/monthly-targets', remove: (id) => `/monthly-targets/${id}` },
  expense_categories: { list: '/expense-categories', create: '/expense-categories', update: (id) => `/expense-categories/${id}`, remove: (id) => `/expense-categories/${id}` },
  suppliers: { list: '/suppliers', create: '/suppliers', update: (id) => `/suppliers/${id}`, remove: (id) => `/suppliers/${id}` },
  customers: { list: '/customers', create: '/customers', update: (id) => `/customers/${id}`, remove: (id) => `/customers/${id}` },
  products: { list: '/products', create: '/products', update: (id) => `/products/${id}`, remove: (id) => `/products/${id}` },
  investments: { list: '/investments', create: '/investments', update: (id) => `/investments/${id}`, remove: (id) => `/investments/${id}` },
  profit_withdrawals: { list: '/profit-withdrawals', create: '/profit-withdrawals', update: (id) => `/profit-withdrawals/${id}`, remove: (id) => `/profit-withdrawals/${id}` },
  loans: { list: '/loans', create: '/loans', update: (id) => `/loans/${id}`, remove: (id) => `/loans/${id}` },
  loan_lenders: { list: '/loan-lenders', create: '/loan-lenders', update: (id) => `/loan-lenders/${id}`, remove: (id) => `/loan-lenders/${id}` },
  expenses: { list: '/expenses', create: '/expenses', update: (id) => `/expenses/${id}`, remove: (id) => `/expenses/${id}` },
  other_incomes: { list: '/other-incomes', create: '/other-incomes', update: (id) => `/other-incomes/${id}`, remove: (id) => `/other-incomes/${id}` },
  purchases: { list: '/purchases', update: (id) => `/purchases/${id}`, remove: (id) => `/purchases/${id}` },
  purchase_items: { list: '', flattenFrom: { list: '/purchases', key: 'purchase_items' } },
  purchase_receives: { list: '', flattenFrom: { list: '/purchases', key: 'purchase_receives' } },
  supplier_payments: { list: '/supplier-payments', create: '/supplier-payments', update: (id) => `/supplier-payments/${id}`, remove: (id) => `/supplier-payments/${id}` },
  inventory: { list: '/inventory' },
  inventory_history: { list: '/inventory/history' },
  inventory_batches: { list: '/inventory/batches' },
  sales: { list: '/sales', update: (id) => `/sales/${id}`, remove: (id) => `/sales/${id}` },
  sale_items: { list: '', flattenFrom: { list: '/sales', key: 'sale_items' } },
  sale_deliveries: { list: '', flattenFrom: { list: '/sales', key: 'sale_deliveries' } },
  sale_payments: { list: '/sale-payments', create: '/sale-payments', update: (id) => `/sale-payments/${id}`, remove: (id) => `/sale-payments/${id}` },
  customer_payments: { list: '/customer-payments', create: '/customer-payments', update: (id) => `/customer-payments/${id}`, remove: (id) => `/customer-payments/${id}` },
  employees: { list: '/employees', create: '/employees', update: (id) => `/employees/${id}`, remove: (id) => `/employees/${id}` },
  salary_transactions: { list: '/salary-transactions', create: '/salary-transactions', update: (id) => `/salary-transactions/${id}`, remove: (id) => `/salary-transactions/${id}` },
  attendance: { list: '/attendance', upsertPut: '/attendance', remove: (id) => `/attendance/${id}` },
  owner_subscriptions: { list: '/subscriptions/my' },
  // Team profiles (owner-only endpoint; other roles degrade to an empty list).
  profiles: { list: '/users/list' },
}

type Filter =
  | { kind: 'eq'; column: string; value: any }
  | { kind: 'neq'; column: string; value: any }
  | { kind: 'in'; column: string; values: any[] }
  | { kind: 'gt' | 'gte' | 'lt' | 'lte'; column: string; value: any }
  | { kind: 'is'; column: string; value: any }
  | { kind: 'not_is'; column: string; value: any }
  | { kind: 'ilike'; column: string; pattern: string }

interface QueryState {
  table: string
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  payload?: any
  filters: Filter[]
  orders: { column: string; ascending: boolean }[]
  limitCount?: number
  single: boolean
  maybe: boolean
  wantsReturn: boolean
}

const matchesFilter = (row: Row, filter: Filter): boolean => {
  const value = row?.[filter.kind === 'in' ? filter.column : filter.column]
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

const applyFilters = (rows: Row[], filters: Filter[]) => rows.filter((row) => filters.every((f) => matchesFilter(row, f)))

const applyOrder = (rows: Row[], orders: { column: string; ascending: boolean }[]) => {
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

async function fetchRows(table: string): Promise<Row[]> {
  const config = TABLES[table]
  if (!config) throw new Error(`Table not supported by API layer: ${table}`)

  if (config.flattenFrom) {
    const response = await api.get(config.flattenFrom.list)
    const parents: Row[] = response.data.data || []
    if (config.flattenFrom.key === 'purchase_receives') {
      return parents.flatMap((parent) =>
        (parent.purchase_items || []).flatMap((item: Row) => item.purchase_receives || []))
    }
    return parents.flatMap((parent) => parent[config.flattenFrom!.key] || [])
  }

  const response = await api.get(config.list)
  const data = response.data.data
  // Single-object endpoints (business_settings, owner_subscriptions).
  if (data && !Array.isArray(data)) return [data]
  return data || []
}

async function runQuery(state: QueryState): Promise<{ data: any; error: any; count?: number }> {
  const config = TABLES[state.table]

  try {
    if (!config) throw new Error(`Table not supported by API layer: ${state.table}`)

    if (state.action === 'select') {
      let rows = applyFilters(await fetchRows(state.table), state.filters)
      rows = applyOrder(rows, state.orders)
      if (state.limitCount !== undefined) rows = rows.slice(0, state.limitCount)
      if (state.single || state.maybe) {
        return { data: rows[0] ?? null, error: state.single && rows.length === 0 ? { message: 'Row not found' } : null }
      }
      return { data: rows, error: null, count: rows.length }
    }

    if (state.action === 'insert') {
      const payloads: Row[] = Array.isArray(state.payload) ? state.payload : [state.payload]
      const endpoint = config.create ?? config.upsertPut
      if (!endpoint) throw new Error(`Insert not supported for table: ${state.table}`)
      const created: Row[] = []
      for (const payload of payloads) {
        const response = config.create
          ? await api.post(endpoint, payload)
          : await api.put(endpoint, payload)
        created.push(response.data.data)
      }
      const data = Array.isArray(state.payload) ? created : created[0]
      return { data: state.wantsReturn ? data : null, error: null }
    }

    if (state.action === 'upsert') {
      const payloads: Row[] = Array.isArray(state.payload) ? state.payload : [state.payload]
      const saved: Row[] = []
      if (state.table === 'products') {
        const response = await api.post('/products/bulk-upsert', { products: payloads })
        return { data: state.wantsReturn ? response.data.data : null, error: null }
      }
      if (!config.upsertPut) throw new Error(`Upsert not supported for table: ${state.table}`)
      for (const payload of payloads) {
        const response = await api.put(config.upsertPut, payload)
        saved.push(response.data.data)
      }
      const data = Array.isArray(state.payload) ? saved : saved[0]
      return { data: state.wantsReturn ? data : null, error: null }
    }

    if (state.action === 'update') {
      // business_settings updates without an id go through the PUT upsert.
      if (config.upsertPut && !state.filters.some((f) => f.kind === 'eq' && f.column === 'id')) {
        const response = await api.put(config.upsertPut, state.payload)
        return { data: state.wantsReturn ? response.data.data : null, error: null }
      }

      if (!config.update) throw new Error(`Update not supported for table: ${state.table}`)
      const idFilter = state.filters.find((f) => f.kind === 'eq' && f.column === 'id') as { value: string } | undefined
      if (idFilter) {
        const response = await api.patch(config.update(idFilter.value), state.payload)
        return { data: state.wantsReturn ? response.data.data : null, error: null }
      }
      // Update by non-id filters: resolve ids first, then patch each.
      const rows = applyFilters(await fetchRows(state.table), state.filters)
      const updated: Row[] = []
      for (const row of rows) {
        const response = await api.patch(config.update(row.id), state.payload)
        updated.push(response.data.data)
      }
      return { data: state.wantsReturn ? updated : null, error: null }
    }

    if (state.action === 'delete') {
      if (!config.remove) throw new Error(`Delete not supported for table: ${state.table}`)
      const idFilter = state.filters.find((f) => f.kind === 'eq' && f.column === 'id') as { value: string } | undefined
      const ids: string[] = idFilter
        ? [idFilter.value]
        : applyFilters(await fetchRows(state.table), state.filters).map((row) => row.id)
      for (const id of ids) {
        const recycle = consumeRecycleMeta(state.table, id)
        await api.delete(config.remove(id), recycle ? { data: { recycle } } : undefined)
      }
      return { data: null, error: null }
    }

    throw new Error(`Unsupported action: ${state.action}`)
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || 'Request failed'
    return { data: state.single || state.maybe ? null : [], error: { message, code: error?.response?.status } }
  }
}

class QueryBuilder implements PromiseLike<{ data: any; error: any; count?: number }> {
  private state: QueryState

  constructor(table: string) {
    this.state = { table, action: 'select', filters: [], orders: [], single: false, maybe: false, wantsReturn: false }
  }

  select(_columns?: string, _options?: any) {
    if (this.state.action === 'select') this.state.action = 'select'
    this.state.wantsReturn = true
    return this
  }

  insert(payload: any) { this.state.action = 'insert'; this.state.payload = payload; return this }
  upsert(payload: any, _options?: any) { this.state.action = 'upsert'; this.state.payload = payload; return this }
  update(payload: any) { this.state.action = 'update'; this.state.payload = payload; return this }
  delete() { this.state.action = 'delete'; return this }

  eq(column: string, value: any) { this.state.filters.push({ kind: 'eq', column, value }); return this }
  neq(column: string, value: any) { this.state.filters.push({ kind: 'neq', column, value }); return this }
  in(column: string, values: any[]) { this.state.filters.push({ kind: 'in', column, values }); return this }
  gt(column: string, value: any) { this.state.filters.push({ kind: 'gt', column, value }); return this }
  gte(column: string, value: any) { this.state.filters.push({ kind: 'gte', column, value }); return this }
  lt(column: string, value: any) { this.state.filters.push({ kind: 'lt', column, value }); return this }
  lte(column: string, value: any) { this.state.filters.push({ kind: 'lte', column, value }); return this }
  is(column: string, value: any) { this.state.filters.push({ kind: 'is', column, value }); return this }
  not(column: string, operator: string, value: any) {
    if (operator === 'is') this.state.filters.push({ kind: 'not_is', column, value })
    return this
  }
  ilike(column: string, pattern: string) { this.state.filters.push({ kind: 'ilike', column, pattern }); return this }

  order(column: string, options?: { ascending?: boolean }) {
    this.state.orders.push({ column, ascending: options?.ascending !== false })
    return this
  }
  limit(count: number) { this.state.limitCount = count; return this }
  range(from: number, to: number) { this.state.limitCount = to + 1; return this }

  single() { this.state.single = true; return this }
  maybeSingle() { this.state.maybe = true; return this }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return runQuery(this.state).then(onfulfilled, onrejected)
  }
}

// Auth surface kept for any stragglers - the app should use AuthContext,
// but a page calling supabase.auth.getSession() won't crash.
const authShim = {
  async getSession() {
    return { data: { session: null }, error: null }
  },
  async getUser() {
    return { data: { user: null }, error: null }
  },
  async signOut() {
    return { error: null }
  },
}

// Realtime channels don't exist over REST - pages refresh after their own
// actions, so subscriptions become inert stubs.
class ChannelShim {
  on(_event: string, _filter: any, _callback?: any) { return this }
  subscribe(_callback?: any) { return this }
  unsubscribe() { return Promise.resolve('ok') }
}

export const supabase = {
  from(table: string) {
    return new QueryBuilder(table)
  },
  auth: authShim,
  channel(_name: string) {
    return new ChannelShim()
  },
  removeChannel(_channel: any) {
    return Promise.resolve('ok')
  },
}
