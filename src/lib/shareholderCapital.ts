/**
 * What a shareholder has actually put into the business.
 *
 * Opening amount plus everything invested since, less everything withdrawn.
 * The withdrawals belong in it: a shareholder who put in 10 lakh and took 4
 * back has 6 in the company, and a figure that ignored that would say the
 * business holds capital it handed back.
 *
 * The Shareholder Dashboard already values a shareholder's stake this way when
 * it splits the monthly profit, so the list has to agree with it - two pages
 * disagreeing about the same shareholder's capital is worse than neither
 * showing it.
 */

export type InvestmentRecord = {
  shareholder_id?: string | null
  shareholder_name?: string | null
  invest_amount?: number | string | null
  withdraw_amount?: number | string | null
}

export type ShareholderLike = {
  id: string
  name?: string | null
  opening_amount?: number | string | null
}

const amount = (value: unknown) => Number(value || 0)

/**
 * Whether an investment row belongs to this shareholder.
 *
 * Falls back to the name because the older rows were written before the id was
 * stored, and those are still someone's money.
 */
export function investmentBelongsTo(record: InvestmentRecord, shareholder: ShareholderLike) {
  if (record.shareholder_id) return record.shareholder_id === shareholder.id
  return Boolean(record.shareholder_name) && record.shareholder_name === shareholder.name
}

/** Invested less withdrawn, over the rows that belong to this shareholder. */
export function netInvested(records: InvestmentRecord[], shareholder: ShareholderLike) {
  return records
    .filter(record => investmentBelongsTo(record, shareholder))
    .reduce((sum, record) => sum + amount(record.invest_amount) - amount(record.withdraw_amount), 0)
}

/** Opening amount plus the net of everything since. */
export function totalInvestment(records: InvestmentRecord[], shareholder: ShareholderLike) {
  return amount(shareholder.opening_amount) + netInvested(records, shareholder)
}
