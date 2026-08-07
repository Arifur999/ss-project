import { describe, it, expect } from 'vitest'
import { applyFilters, applyOrder, applyRange, matchesFilter, type Row } from './queryEngine'

// These tests pin down how a query behaves TODAY. They are not a wish list -
// several of them lock in quirks (strict equality, % being stripped from
// ilike, null matching undefined) precisely because every figure on every page
// is computed through these rules. If server-side filtering is ever made
// authoritative, it has to reproduce each of these exactly; until then the
// server may only narrow a result set and these rules decide it.

const rows: Row[] = [
  { id: 'a', name: 'Wooden Chair', code: 1, qty: 10, deleted_at: null, price: '100' },
  { id: 'b', name: 'wooden table', code: 2, qty: 0, deleted_at: '2026-01-01', price: '90' },
  { id: 'c', name: 'Steel Almirah', code: '2', qty: 5, price: '9' },
  { id: 'd', name: '', code: 3, qty: 25, deleted_at: null, price: '1000' },
]

describe('eq / neq are strict', () => {
  it('does not coerce a number to a string', () => {
    expect(applyFilters(rows, [{ kind: 'eq', column: 'code', value: 2 }]).map(r => r.id)).toEqual(['b'])
    expect(applyFilters(rows, [{ kind: 'eq', column: 'code', value: '2' }]).map(r => r.id)).toEqual(['c'])
  })

  it('neq keeps rows where the column is missing', () => {
    expect(applyFilters(rows, [{ kind: 'neq', column: 'deleted_at', value: null }]).map(r => r.id)).toEqual(['b', 'c'])
  })
})

describe('is / not_is treat a missing column as null', () => {
  it('is null matches both null and undefined', () => {
    expect(applyFilters(rows, [{ kind: 'is', column: 'deleted_at', value: null }]).map(r => r.id)).toEqual(['a', 'c', 'd'])
  })

  it('not_is null excludes both null and undefined', () => {
    expect(applyFilters(rows, [{ kind: 'not_is', column: 'deleted_at', value: null }]).map(r => r.id)).toEqual(['b'])
  })
})

describe('ilike is a case-insensitive contains, not SQL LIKE', () => {
  it('ignores where the wildcards are', () => {
    const ids = (pattern: string) => applyFilters(rows, [{ kind: 'ilike', column: 'name', pattern }]).map(r => r.id)
    expect(ids('%wooden%')).toEqual(['a', 'b'])
    expect(ids('wooden')).toEqual(['a', 'b'])
    expect(ids('WOODEN')).toEqual(['a', 'b'])
  })

  it('a % in the middle is dropped rather than matching anything', () => {
    // SQL would read this as "wooden<anything>chair"; here it becomes
    // "woodenchair", which matches nothing.
    expect(applyFilters(rows, [{ kind: 'ilike', column: 'name', pattern: 'wooden%chair' }])).toEqual([])
  })

  it('an empty pattern matches every row, including a missing value', () => {
    expect(applyFilters(rows, [{ kind: 'ilike', column: 'name', pattern: '%%' }]).map(r => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('comparisons use JavaScript rules', () => {
  it('compares numbers numerically', () => {
    expect(applyFilters(rows, [{ kind: 'gte', column: 'qty', value: 10 }]).map(r => r.id)).toEqual(['a', 'd'])
  })

  it('compares a text column as text, which is not numeric order', () => {
    // '90' and '9' beat '100' because '9' > '1' at the first character, and
    // '1000' beats it by being longer with the same prefix. A numeric column
    // would order these completely differently - which is exactly why a
    // server-side comparison cannot be swapped in without proof.
    expect(applyFilters(rows, [{ kind: 'gt', column: 'price', value: '100' }]).map(r => r.id)).toEqual(['b', 'c', 'd'])
  })

  it('a missing value fails every comparison', () => {
    const missing = [{ id: 'x' }]
    expect(applyFilters(missing, [{ kind: 'gt', column: 'qty', value: 0 }])).toEqual([])
    expect(applyFilters(missing, [{ kind: 'lt', column: 'qty', value: 0 }])).toEqual([])
  })
})

describe('in', () => {
  it('matches by strict equality, like eq', () => {
    expect(applyFilters(rows, [{ kind: 'in', column: 'code', values: [2, 3] }]).map(r => r.id)).toEqual(['b', 'd'])
  })
})

describe('several filters are AND-ed', () => {
  it('keeps only rows passing every one', () => {
    const result = applyFilters(rows, [
      { kind: 'is', column: 'deleted_at', value: null },
      { kind: 'gt', column: 'qty', value: 5 },
    ])
    expect(result.map(r => r.id)).toEqual(['a', 'd'])
  })
})

describe('ordering', () => {
  it('sorts ascending and descending', () => {
    expect(applyOrder(rows, [{ column: 'qty', ascending: true }]).map(r => r.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(applyOrder(rows, [{ column: 'qty', ascending: false }]).map(r => r.id)).toEqual(['d', 'a', 'c', 'b'])
  })

  it('falls through to the next key when the first is equal', () => {
    const tied = [
      { id: 'p', a: 1, b: 2 },
      { id: 'q', a: 1, b: 1 },
    ]
    expect(applyOrder(tied, [{ column: 'a', ascending: true }, { column: 'b', ascending: true }]).map(r => r.id))
      .toEqual(['q', 'p'])
  })

  it('leaves the input array untouched', () => {
    const before = rows.map(r => r.id)
    applyOrder(rows, [{ column: 'qty', ascending: true }])
    expect(rows.map(r => r.id)).toEqual(before)
  })

  it('with no ordering, returns the rows as they came', () => {
    expect(applyOrder(rows, []).map(r => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('range', () => {
  it('takes from the start index up to the limit', () => {
    // range(1, 2) reaches this as rangeFrom 1, limitCount 3
    expect(applyRange(rows, 1, 3).map(r => r.id)).toEqual(['b', 'c'])
  })

  it('with neither bound, returns everything', () => {
    expect(applyRange(rows, undefined, undefined).map(r => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('a limit on its own counts from the first row', () => {
    expect(applyRange(rows, undefined, 2).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('asking past the end gives an empty list, not an error', () => {
    expect(applyRange(rows, 99, 200)).toEqual([])
  })
})

describe('matchesFilter on a null row', () => {
  it('does not throw', () => {
    expect(() => matchesFilter(null as unknown as Row, { kind: 'eq', column: 'id', value: 1 })).not.toThrow()
  })
})
