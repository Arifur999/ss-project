import { describe, it, expect, vi } from 'vitest'

// The hook itself needs a DOM to run; what is tested here is the logic inside
// it that can lose or duplicate rows, extracted as the same small pure steps
// the hook performs. These are the cases that would corrupt a list:
//
//   - a page arriving twice, so a row is appended twice
//   - a slow page landing after a newer one and overwriting it
//   - a delete leaving the total wrong, so "load more" never stops or stops early

type Row = { id: string; name: string }

// Mirrors the append in loadMore.
function appendPage(current: Row[], incoming: Row[]): Row[] {
  const seen = new Set(current.map((row) => row.id))
  return [...current, ...incoming.filter((row) => !seen.has(row.id))]
}

// Mirrors removeItems.
function removeRows(current: Row[], total: number, ids: string[]) {
  const drop = new Set(ids)
  return {
    items: current.filter((row) => !drop.has(row.id)),
    total: Math.max(0, total - ids.length),
  }
}

const page = (from: number, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `p${from + i}`, name: `Product ${from + i}` }))

describe('appending a page', () => {
  it('adds the next page in order', () => {
    const result = appendPage(page(1, 40), page(41, 40))
    expect(result).toHaveLength(80)
    expect(result[0].id).toBe('p1')
    expect(result[79].id).toBe('p80')
  })

  it('ignores a page that arrives twice', () => {
    // The scroll sentinel can fire again before state has settled.
    const once = appendPage(page(1, 40), page(41, 40))
    const twice = appendPage(once, page(41, 40))
    expect(twice).toHaveLength(80)
  })

  it('keeps the rows already loaded when a page overlaps', () => {
    const result = appendPage(page(1, 40), page(31, 20))
    expect(result).toHaveLength(50)
    expect(new Set(result.map((r) => r.id)).size).toBe(50)
  })
})

describe('removing rows locally after a delete', () => {
  it('drops the rows and lowers the total, so hasMore stays right', () => {
    const { items, total } = removeRows(page(1, 40), 3188, ['p3', 'p7'])
    expect(items).toHaveLength(38)
    expect(items.find((r) => r.id === 'p3')).toBeUndefined()
    expect(total).toBe(3186)
  })

  it('never lets the total go below zero', () => {
    const { total } = removeRows(page(1, 2), 2, ['p1', 'p2', 'p3'])
    expect(total).toBe(0)
  })
})

describe('hasMore', () => {
  const hasMore = (loaded: number, total: number) => loaded < total

  it('is true until every matching row is loaded', () => {
    expect(hasMore(40, 3188)).toBe(true)
    expect(hasMore(3188, 3188)).toBe(false)
  })

  it('is false for an empty result, so nothing tries to load a page 2', () => {
    expect(hasMore(0, 0)).toBe(false)
  })
})

describe('out-of-order responses', () => {
  // The hook stamps every fetch with an id and drops anything that is not the
  // newest. Without it, a slow search for "a" landing after "abc" would put
  // the wrong rows on screen under the right query.
  it('keeps only the newest request', () => {
    let requestId = 0
    const applied: string[] = []
    const start = (label: string) => {
      const id = ++requestId
      return () => { if (id === requestId) applied.push(label) }
    }

    const slowFirst = start('search:a')
    const fastSecond = start('search:abc')

    fastSecond()
    slowFirst() // arrives late, must be ignored

    expect(applied).toEqual(['search:abc'])
  })
})

describe('search debounce', () => {
  it('fires once for a burst of typing', () => {
    vi.useFakeTimers()
    const run = vi.fn()
    let timer: ReturnType<typeof setTimeout>
    const type = (value: string) => {
      clearTimeout(timer)
      timer = setTimeout(() => run(value), 350)
    }

    for (const value of ['w', 'wo', 'woo', 'wood']) type(value)
    vi.advanceTimersByTime(400)

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('wood')
    vi.useRealTimers()
  })
})
