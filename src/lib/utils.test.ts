import { describe, expect, it } from 'vitest'
import { roundTaka, taka } from './utils'

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
