import { describe, it, expect } from 'vitest'
import { categoryDetail, expenseCategoryFields, incomeSourceFields, needsExpenseCategory, needsIncomeSource } from './loanUtils'

// These three decide where loan profit lands in the books, and they have a twin
// on the server in shared/loanProfitMirror.ts. Keeping the two in step is the
// whole reason this file exists: a drift here is not a wrong number, it is a
// 400 the user cannot explain, or a category left on a row that no longer has
// an expense behind it.

const categories = [
  { id: 'cat-1', name: 'Bank Interest' },
  { id: 'cat-2', name: 'Office Rent' },
]

describe('needsExpenseCategory', () => {
  it('asks for one only when profit was PAID', () => {
    expect(needsExpenseCategory({ payment_category: 'profit', transaction_type: 'payment' })).toBe(true)
  })

  it('asks for nothing when profit was received - Other Income has no categories', () => {
    expect(needsExpenseCategory({ payment_category: 'profit', transaction_type: 'receive' })).toBe(false)
  })

  it('asks for nothing on a principal row either way', () => {
    expect(needsExpenseCategory({ payment_category: 'principal', transaction_type: 'payment' })).toBe(false)
    expect(needsExpenseCategory({ payment_category: 'principal', transaction_type: 'receive' })).toBe(false)
  })

  it('treats a row with no category at all as principal, so old rows are left alone', () => {
    expect(needsExpenseCategory({ transaction_type: 'payment' })).toBe(false)
  })
})

describe('expenseCategoryFields', () => {
  it('sends the id and looks the name up beside it', () => {
    const fields = expenseCategoryFields(
      { payment_category: 'profit', transaction_type: 'payment', expense_category_id: 'cat-1' },
      categories,
    )
    expect(fields).toEqual({ expense_category_id: 'cat-1', expense_category_name: 'Bank Interest' })
  })

  it('clears both columns when the row is not a profit payment, even with a stale id in the form', () => {
    // The bug this exists to prevent: an update is a partial payload, so an
    // omission would leave the old category sitting on a row corrected back to
    // principal, and the next edit would file it as an expense again.
    const fields = expenseCategoryFields(
      { payment_category: 'principal', transaction_type: 'payment', expense_category_id: 'cat-1' },
      categories,
    )
    expect(fields).toEqual({ expense_category_id: null, expense_category_name: '' })
  })

  it('clears both columns when a profit payment is switched to a receipt', () => {
    const fields = expenseCategoryFields(
      { payment_category: 'profit', transaction_type: 'receive', expense_category_id: 'cat-1' },
      categories,
    )
    expect(fields).toEqual({ expense_category_id: null, expense_category_name: '' })
  })

  it('leaves the name blank when the id matches no category it knows about', () => {
    const fields = expenseCategoryFields(
      { payment_category: 'profit', transaction_type: 'payment', expense_category_id: 'gone' },
      categories,
    )
    expect(fields).toEqual({ expense_category_id: 'gone', expense_category_name: '' })
  })

  it('sends a null rather than an empty string when nothing is picked yet', () => {
    const fields = expenseCategoryFields(
      { payment_category: 'profit', transaction_type: 'payment', expense_category_id: '' },
      categories,
    )
    expect(fields.expense_category_id).toBeNull()
  })
})

describe('needsIncomeSource', () => {
  it('asks for one only when profit was RECEIVED', () => {
    expect(needsIncomeSource({ payment_category: 'profit', transaction_type: 'receive' })).toBe(true)
    expect(needsIncomeSource({ payment_category: 'profit', transaction_type: 'payment' })).toBe(false)
    expect(needsIncomeSource({ payment_category: 'principal', transaction_type: 'receive' })).toBe(false)
  })

  it('never agrees with needsExpenseCategory - a row has one side or neither', () => {
    const rows = [
      { payment_category: 'profit', transaction_type: 'receive' },
      { payment_category: 'profit', transaction_type: 'payment' },
      { payment_category: 'principal', transaction_type: 'receive' },
      { payment_category: 'principal', transaction_type: 'payment' },
    ]
    for (const row of rows) {
      expect(needsIncomeSource(row) && needsExpenseCategory(row)).toBe(false)
    }
  })
})

describe('incomeSourceFields', () => {
  it('sends the trimmed source on a profit receipt', () => {
    expect(incomeSourceFields({
      payment_category: 'profit', transaction_type: 'receive', income_source_name: '  Loan Interest  ',
    })).toEqual({ income_source_name: 'Loan Interest' })
  })

  it('sends an empty string when nothing was typed - the server falls back to the lender', () => {
    expect(incomeSourceFields({
      payment_category: 'profit', transaction_type: 'receive',
    })).toEqual({ income_source_name: '' })
  })

  it('clears it when the row is not a profit receipt, even with a stale value in the form', () => {
    expect(incomeSourceFields({
      payment_category: 'profit', transaction_type: 'payment', income_source_name: 'Loan Interest',
    })).toEqual({ income_source_name: '' })
    expect(incomeSourceFields({
      payment_category: 'principal', transaction_type: 'receive', income_source_name: 'Loan Interest',
    })).toEqual({ income_source_name: '' })
  })
})

describe('categoryDetail', () => {
  it('names where a profit row was filed', () => {
    expect(categoryDetail({
      payment_category: 'profit', transaction_type: 'payment',
      payment_amount: 5000, expense_category_name: 'Bank Interest',
    })).toBe('Bank Interest')
  })

  it('says nothing for a principal row, whatever it still carries', () => {
    expect(categoryDetail({
      payment_category: 'principal', transaction_type: 'payment',
      payment_amount: 5000, expense_category_name: 'Bank Interest',
    })).toBe('')
  })

  it('names the income source on a profit receipt', () => {
    expect(categoryDetail({
      payment_category: 'profit', transaction_type: 'receive',
      received_amount: 5000, income_source_name: 'Loan Interest',
    })).toBe('Loan Interest')
  })

  it('says nothing for a profit row carrying neither - an old row', () => {
    expect(categoryDetail({
      payment_category: 'profit', transaction_type: 'receive', received_amount: 5000,
    })).toBe('')
  })
})
