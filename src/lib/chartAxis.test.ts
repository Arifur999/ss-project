import { describe, expect, it } from 'vitest'
import { formatTaka, moneyAxisFormatter, seriesPeak } from './chartAxis'

describe('picking one unit for a money axis', () => {
  it('spells the figure out at the scale a small shop reports', () => {
    // The bug this exists for: dividing by 1000 drew ৳0k five times over.
    const axis = moneyAxisFormatter(1800)
    expect([0, 599, 1200, 1800].map(axis)).toEqual(['৳0', '৳599', '৳1,200', '৳1,800'])
  })

  it('uses thousands once the axis is tall enough to earn them', () => {
    const axis = moneyAxisFormatter(2_400_000)
    expect([0, 600_000, 2_400_000].map(axis)).toEqual(['৳0k', '৳600k', '৳2,400k'])
  })

  it('never mixes the two units on one axis', () => {
    // 75,000 and 113k used to sit next to each other.
    const axis = moneyAxisFormatter(150_000)
    const ticks = [0, 37_500, 75_000, 112_500, 150_000].map(axis)
    expect(ticks.every(t => t.endsWith('k'))).toBe(true)
  })

  it('chooses for the tick Recharts will draw, not for the data', () => {
    // A peak of 98,000 is drawn on an axis topping out at 100,000, which in
    // full precision is wider than the axis has room for.
    expect(moneyAxisFormatter(98_000)(100_000)).toBe('৳100k')
  })

  it('takes the symbol and grouping from the page it is on', () => {
    const finance = moneyAxisFormatter(2_400_000, { symbol: 'Tk\u00A0', locale: 'en-US' })
    expect(finance(600_000)).toBe('Tk\u00A0600k')
    const owner = moneyAxisFormatter(1800, { symbol: '', locale: 'en-US' })
    expect(owner(1200)).toBe('1,200')
  })

  it('survives a series with nothing in it', () => {
    expect(moneyAxisFormatter(0)(0)).toBe('৳0')
  })
})

describe('how tall the series is', () => {
  it('is the largest value', () => {
    expect(seriesPeak([{ v: 10 }, { v: 90 }, { v: 40 }], r => r.v)).toBe(90)
  })

  it('measures a loss by how far it falls, not as nothing', () => {
    // An all-negative profit series used to report a peak of 0, which then
    // picked full-precision ticks for an axis with no room for them.
    expect(seriesPeak([{ v: -90_000 }, { v: -10_000 }], r => r.v)).toBe(90_000)
  })

  it('takes the further of the two directions', () => {
    expect(seriesPeak([{ v: 30_000 }, { v: -120_000 }], r => r.v)).toBe(120_000)
  })

  it('reads a missing or unusable figure as zero', () => {
    expect(seriesPeak([{ v: NaN }, { v: 50 }], r => r.v)).toBe(50)
    expect(seriesPeak([], (r: { v: number }) => r.v)).toBe(0)
  })
})

describe('the platform money format', () => {
  it('matches the cards beside it, byte for byte', () => {
    expect(formatTaka(120000)).toBe('৳120,000')
    expect(formatTaka(0)).toBe('৳0')
  })
})
