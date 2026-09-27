import { describe, it, expect } from 'vitest'
import { needsSupplier, outstandingQty, returnsStock } from './damageRules'

// The server holds the same two rules in shared/damageStatus.ts. They are
// written twice - the form greys a field out before the request is sent, the
// server refuses it whatever the form did - so these tests exist to keep the
// two copies saying the same thing.

describe('needsSupplier', () => {
  it('asks for one when the goods arrived broken', () => {
    expect(needsSupplier('supplier', 'repair')).toBe(true)
  })

  it('asks for one when the goods are going back', () => {
    expect(needsSupplier('own_stock', 'return')).toBe(true)
    expect(needsSupplier('own_stock', 'exchange')).toBe(true)
  })

  // The case that must stay free: a chair broken in the showroom goes to a
  // local carpenter, not a supplier. Demanding one would have the operator
  // inventing a supplier to get past the form.
  it('leaves own-stock repair free', () => {
    expect(needsSupplier('own_stock', 'repair')).toBe(false)
  })

  it('decides all six combinations, five of them yes', () => {
    const sources = ['own_stock', 'supplier'] as const
    const actions = ['repair', 'return', 'exchange'] as const
    const answers = sources.flatMap(source => actions.map(action => needsSupplier(source, action)))
    expect(answers).toHaveLength(6)
    expect(answers.filter(Boolean)).toHaveLength(5)
  })
})

describe('returnsStock', () => {
  it('puts repaired and replaced goods back', () => {
    expect(returnsStock('repaired')).toBe(true)
    expect(returnsStock('replaced')).toBe(true)
  })

  it('does not put a scrapped piece back', () => {
    expect(returnsStock('scrapped')).toBe(false)
  })
})

describe('outstandingQty', () => {
  it('is what has not come back yet', () => {
    expect(outstandingQty({ qty: 5, received_qty: 2 })).toBe(3)
  })

  it('never goes below zero, whatever the data says', () => {
    expect(outstandingQty({ qty: 2, received_qty: 5 })).toBe(0)
  })
})
