import { describe, expect, it } from 'vitest'
import { firstAmount, roundTaka, saleItemAmount, taka } from './utils'

describe('roundTaka', () => {
  it('drops the paisa below half a taka', () => {
    expect(roundTaka(105.4)).toBe(105)
    expect(roundTaka(105.49)).toBe(105)
    expect(roundTaka(0.4)).toBe(0)
  })

  it('rounds up from half a taka', () => {
    expect(roundTaka(105.5)).toBe(106)
    expect(roundTaka(105.9)).toBe(106)
    expect(roundTaka(0.5)).toBe(1)
  })

  it('rounds a negative the same distance from zero as its positive twin', () => {
    // Math.round alone breaks ties towards +Infinity, so -105.5 would come out
    // -105 while 105.5 comes out 106. A due of -105.5 and a credit of 105.5 have
    // to round to the same magnitude or the Balance sheet stops balancing.
    expect(roundTaka(-105.5)).toBe(-106)
    expect(roundTaka(-105.4)).toBe(-105)
    expect(roundTaka(-105.9)).toBe(-106)
  })

  it('leaves whole taka alone', () => {
    expect(roundTaka(0)).toBe(0)
    expect(roundTaka(106)).toBe(106)
    expect(roundTaka(-106)).toBe(-106)
    expect(roundTaka(1234567)).toBe(1234567)
  })

  it('reads the numeric strings the API sends for Decimal columns', () => {
    expect(roundTaka('105.9')).toBe(106)
    expect(roundTaka('105.40')).toBe(105)
    expect(roundTaka('0')).toBe(0)
  })

  it('returns zero for anything that is not a finite number', () => {
    // A missing money field used to blank a whole page rather than show a zero
    // in one cell, so this guard is load-bearing, not defensive noise.
    expect(roundTaka(null)).toBe(0)
    expect(roundTaka(undefined)).toBe(0)
    expect(roundTaka('')).toBe(0)
    expect(roundTaka('abc')).toBe(0)
    expect(roundTaka(NaN)).toBe(0)
    expect(roundTaka(Infinity)).toBe(0)
    expect(roundTaka(-Infinity)).toBe(0)
    expect(roundTaka({})).toBe(0)
  })

  it('never returns negative zero, which would render as "-0"', () => {
    expect(roundTaka(-0)).toBe(0)
    expect(roundTaka(-0.2)).toBe(0)
    expect(Object.is(roundTaka(-0.2), -0)).toBe(false)
    expect(roundTaka(-0.2).toLocaleString('en-US')).toBe('0')
  })

  it('taka is the same function under the read-side name', () => {
    expect(taka('105.9')).toBe(106)
    expect(taka(null)).toBe(0)
  })
})

describe('firstAmount', () => {
  it('takes a present zero rather than falling through to a bigger field', () => {
    // The whole point. A Tk 40,000 wardrobe given away free has total_amount 0,
    // and `a || b` would have fallen through to the Tk 40,000 MRP - booking a
    // giveaway as revenue and as profit.
    expect(firstAmount(0, 40_000)).toBe(0)
    expect(firstAmount('0', 40_000)).toBe(0)
    expect(firstAmount(0, 40_000, 99_999)).toBe(0)
  })

  it('is what a fully discounted invoice needs', () => {
    // net_amount 0 against a pre-discount subtotal of 50,000.
    expect(firstAmount(0, 50_000)).toBe(0)
  })

  it('falls through when a field is genuinely missing', () => {
    expect(firstAmount(null, 40_000)).toBe(40_000)
    expect(firstAmount(undefined, 40_000)).toBe(40_000)
    expect(firstAmount('', 40_000)).toBe(40_000)
    expect(firstAmount(null, undefined, 40_000)).toBe(40_000)
  })

  it('prefers the first present field over any later one', () => {
    expect(firstAmount(1_000, 2_000, 3_000)).toBe(1_000)
    expect(firstAmount(null, 2_000, 3_000)).toBe(2_000)
  })

  it('rounds what it returns', () => {
    expect(firstAmount(105.9)).toBe(106)
    expect(firstAmount(null, '105.4')).toBe(105)
  })

  it('is zero when every field is missing', () => {
    expect(firstAmount()).toBe(0)
    expect(firstAmount(null, undefined, '')).toBe(0)
  })

  it('keeps a negative, which is a real credit balance', () => {
    expect(firstAmount(-500, 40_000)).toBe(-500)
  })
})

describe('saleItemAmount', () => {
  it('prefers the saved line total', () => {
    expect(saleItemAmount({ total_amount: 9_000, actual_price: 3_000, selling_price: 4_000 }, 3)).toBe(9_000)
  })

  it('books a free line at zero, not at its MRP', () => {
    // The Tk 40,000 wardrobe given away with a bedroom set.
    expect(saleItemAmount({ total_amount: 0, actual_price: 0, selling_price: 40_000 }, 1)).toBe(0)
  })

  it('falls back to actual_price x qty only when the total is missing', () => {
    expect(saleItemAmount({ actual_price: 3_000, selling_price: 4_000 }, 3)).toBe(9_000)
    expect(saleItemAmount({ total_amount: null, actual_price: 3_000, selling_price: 4_000 }, 3)).toBe(9_000)
  })

  it('honours a discounted actual_price of zero over the MRP', () => {
    expect(saleItemAmount({ actual_price: 0, selling_price: 4_000 }, 3)).toBe(0)
  })

  it('reaches selling_price only when both better fields are absent', () => {
    expect(saleItemAmount({ selling_price: 4_000 }, 3)).toBe(12_000)
  })

  it('never returns NaN when a field is missing entirely', () => {
    // A missing actual_price multiplied by qty is NaN, which a plain
    // firstAmount(...) chain would have accepted as a present value.
    expect(saleItemAmount({}, 3)).toBe(0)
    expect(Number.isFinite(saleItemAmount({}, 3))).toBe(true)
  })

  it('rounds to the whole taka', () => {
    expect(saleItemAmount({ selling_price: 105.9 }, 1)).toBe(106)
    expect(saleItemAmount({ actual_price: '333.4' }, 3)).toBe(999)
  })
})

describe('rounding on the way in, not at display time', () => {
  it('makes a column of rows add up to the total printed under it', () => {
    // The reason every money field is rounded as it is read rather than as it is
    // shown. Two rows of 10.4 sum to 20.8, which displays as 21 - beneath rows
    // that each display as 10. Rounding first makes 10 + 10 = 20.
    const raw = [10.4, 10.4]
    const rounded = raw.map(roundTaka)
    expect(rounded.reduce((a, b) => a + b, 0)).toBe(20)
    expect(rounded).toEqual([10, 10])
  })

  it('holds for a long column of thirds', () => {
    const rows = Array.from({ length: 30 }, () => roundTaka(1000 / 3))
    expect(new Set(rows).size).toBe(1)
    expect(rows.reduce((a, b) => a + b, 0)).toBe(333 * 30)
  })
})
