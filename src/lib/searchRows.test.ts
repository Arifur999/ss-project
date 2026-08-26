import { describe, expect, it } from 'vitest'
import { filterRows, rowMatches } from './searchRows'

type Receipt = { name: string; phone: string; receiver: string; amount: number }
const rows: Receipt[] = [
  { name: 'Khadiza Dolly', phone: '01331324646', receiver: 'Khaled Mahmud', amount: 39800 },
  { name: 'Khadiza Akter', phone: '01326896782', receiver: 'Khaled Mahmud', amount: 55000 },
  { name: 'Md Sohag', phone: '01757821329', receiver: 'Md Jowel', amount: 22500 },
]
const fields = [
  (r: Receipt) => r.name,
  (r: Receipt) => r.phone,
  (r: Receipt) => r.receiver,
  (r: Receipt) => r.amount.toLocaleString('en-US'),
]

describe('finding one receipt among many', () => {
  it('matches a name', () => {
    expect(filterRows(rows, fields, 'sohag').map(r => r.name)).toEqual(['Md Sohag'])
  })

  it('matches a phone number the reader half-remembers', () => {
    expect(filterRows(rows, fields, '3268').map(r => r.name)).toEqual(['Khadiza Akter'])
  })

  it('does not care which column the word lives in', () => {
    // "Khaled" is a receiver here, not a customer.
    expect(filterRows(rows, fields, 'khaled')).toHaveLength(2)
  })

  it('narrows on every word rather than widening', () => {
    // Two words must both appear; otherwise "khadiza jowel" would return
    // everything with either, which is the opposite of searching.
    expect(filterRows(rows, fields, 'khadiza akter').map(r => r.name)).toEqual(['Khadiza Akter'])
    expect(filterRows(rows, fields, 'khadiza jowel')).toHaveLength(0)
  })

  it('finds an amount typed with or without its comma', () => {
    expect(filterRows(rows, fields, '39,800').map(r => r.name)).toEqual(['Khadiza Dolly'])
    expect(filterRows(rows, fields, '39800').map(r => r.name)).toEqual(['Khadiza Dolly'])
  })

  it('ignores case and stray spaces', () => {
    expect(filterRows(rows, fields, '  KHADIZA   DOLLY ').map(r => r.name)).toEqual(['Khadiza Dolly'])
  })

  it('returns everything for an empty query', () => {
    expect(filterRows(rows, fields, '')).toHaveLength(3)
    expect(filterRows(rows, fields, '   ')).toHaveLength(3)
  })

  it('survives a row with missing fields', () => {
    const sparse = [{ name: '', phone: '', receiver: '', amount: 0 }] as Receipt[]
    expect(() => filterRows(sparse, fields, 'anything')).not.toThrow()
    expect(filterRows(sparse, fields, 'anything')).toHaveLength(0)
  })

  it('is the same rule row by row', () => {
    expect(rowMatches(rows[0], fields, 'dolly')).toBe(true)
    expect(rowMatches(rows[0], fields, 'sohag')).toBe(false)
  })
})
