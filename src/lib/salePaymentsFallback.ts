// Split sale payments that never reached the server.
//
// A sale can be settled across several accounts, and each split is its own
// sale_payments row. When that write failed the rows were parked in
// localStorage so the money still showed on the Balance Dashboard rather than
// vanishing from the account it went into.
//
// Lifted out of Balance.tsx when the Account Ledger needed the same rows: both
// screens describe the same account, and a payment one of them counts and the
// other does not is exactly the disagreement these pages exist to avoid.
const SALE_PAYMENTS_FALLBACK_KEY = 'sales_split_payment_fallback_v1'

function readStorageMap(key: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}')
  } catch {
    // A corrupted entry is not worth losing the page over - the server rows are
    // the real answer and these are the leftovers.
    return {}
  }
}

/**
 * Every parked split payment, flattened out of the per-sale map.
 *
 * Untyped rows on purpose: these are whatever the sale form last held, replayed
 * into the same folds the server rows go through, and giving them a shape here
 * would claim a guarantee localStorage cannot make.
 */
export function fallbackSalePayments(): unknown[] {
  const map = readStorageMap(SALE_PAYMENTS_FALLBACK_KEY)
  return Object.values(map).flatMap(value => Array.isArray(value) ? value : value ? [value] : [])
}
