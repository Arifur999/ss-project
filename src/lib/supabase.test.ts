import { describe, expect, it } from 'vitest'
import { buildListQuery } from './supabase'
import type { Filter } from './queryEngine'

// What the server is allowed to be told about a query.
//
// The rule these all protect is the one at the top of queryEngine.ts: pushing
// a filter to the server may only ever NARROW what comes back, never decide
// it. The browser re-applies every filter over the response, so a range that
// is too wide costs a few extra rows, while one that is too narrow silently
// drops real data from the page.

const salesConfig = { list: '/sales', dateColumn: 'date' }
const noPushdown = { list: '/products' }

const gte = (column: string, value: unknown): Filter => ({ kind: 'gte', column, value })
const lte = (column: string, value: unknown): Filter => ({ kind: 'lte', column, value })

describe('buildListQuery', () => {
  it('sends a date range as from/to', () => {
    const query = buildListQuery(salesConfig, [gte('date', '2026-08-01'), lte('date', '2026-08-31')])
    expect(new URLSearchParams(query).get('from')).toBe('2026-08-01')
    expect(new URLSearchParams(query).get('to')).toBe('2026-08-31')
  })

  it('sends nothing for a table whose endpoint has no date support', () => {
    expect(buildListQuery(noPushdown, [gte('date', '2026-08-01')])).toBe('')
  })

  it('ignores a bound on any other column', () => {
    expect(buildListQuery(salesConfig, [gte('created_at', '2026-08-01')])).toBe('')
    expect(buildListQuery(salesConfig, [gte('net_amount', 500)])).toBe('')
  })

  it('ignores filter kinds that are not a range', () => {
    expect(buildListQuery(salesConfig, [{ kind: 'eq', column: 'date', value: '2026-08-01' }])).toBe('')
    expect(buildListQuery(salesConfig, [{ kind: 'is', column: 'date', value: null }])).toBe('')
  })

  it('ignores a value that is not a date, rather than guessing', () => {
    expect(buildListQuery(salesConfig, [gte('date', 20260801)])).toBe('')
    expect(buildListQuery(salesConfig, [gte('date', '01-08-2026')])).toBe('')
    expect(buildListQuery(salesConfig, [gte('date', null)])).toBe('')
    expect(buildListQuery(salesConfig, [gte('date', undefined)])).toBe('')
  })

  it('widens a timestamp to its day', () => {
    // Cutting to the day can only pull IN more rows, which the browser then
    // filters out. Rounding the other way would lose same-day rows.
    const query = new URLSearchParams(buildListQuery(salesConfig, [gte('date', '2026-08-01T14:30:00Z')]))
    expect(query.get('from')).toBe('2026-08-01')
  })

  it('widens the exclusive gt/lt to an inclusive from/to', () => {
    const query = new URLSearchParams(
      buildListQuery(salesConfig, [
        { kind: 'gt', column: 'date', value: '2026-08-01' },
        { kind: 'lt', column: 'date', value: '2026-08-31' },
      ])
    )
    expect(query.get('from')).toBe('2026-08-01')
    expect(query.get('to')).toBe('2026-08-31')
  })

  it('sends one open end when only one bound is given', () => {
    const from = new URLSearchParams(buildListQuery(salesConfig, [gte('date', '2026-08-01')]))
    expect(from.get('from')).toBe('2026-08-01')
    expect(from.get('to')).toBeNull()
  })

  it('sends nothing when the query has no filters at all', () => {
    expect(buildListQuery(salesConfig, [])).toBe('')
  })
})
