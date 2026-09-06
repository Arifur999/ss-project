// ---------------------------------------------------------------------------
// The contract between the page that parks a form and the page that reopens it.
//
// A draft stores the form verbatim, which is the only way a half-finished order
// can be stored at all - but it also means a renamed field would hydrate an old
// draft half-correctly and publish something subtly wrong, with nothing to
// catch it. So each snapshot carries the version of the shape it was written
// in, and a reopened draft stamped with anything else is refused rather than
// guessed at.
//
// BUMP THE VERSION whenever a field here is added, renamed, or has the way it
// is derived changed.
// ---------------------------------------------------------------------------

export const PURCHASE_DRAFT_VERSION = 1
export const SALE_DRAFT_VERSION = 1

export type PurchaseDraftPayload = {
  v: number
  form: {
    si_no: string
    supplier_id: string
    supplier_name: string
    date: string
    account_id: string
    notes: string
    shipping_status: string
  }
  items: Record<string, unknown>[]
  spPercent: number
}

export type SaleDraftPayload = {
  v: number
  form: {
    invoice_no: string
    date: string
    customer_id: string
    customer_name: string
    customer_phone: string
    customer_address: string
    account_id: string
    account_name: string
    notes: string
  }
  items: Record<string, unknown>[]
  paymentRows: Record<string, unknown>[]
  /**
   * What the operator meant to collect against the customer's OLD balance.
   *
   * Not a column on a sale - at save time it becomes a separate customer
   * payment - and it is the one figure in here that goes stale dangerously: the
   * customer may have settled that due before the draft was reopened. Whoever
   * hydrates this must clamp it to the live figure, or a payment is booked
   * against a due that no longer exists.
   */
  previousDuePay: number
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function isPurchaseDraftPayload(value: unknown): value is PurchaseDraftPayload {
  if (!isObject(value)) return false
  return value.v === PURCHASE_DRAFT_VERSION && isObject(value.form) && Array.isArray(value.items)
}

export function isSaleDraftPayload(value: unknown): value is SaleDraftPayload {
  if (!isObject(value)) return false
  return value.v === SALE_DRAFT_VERSION && isObject(value.form) && Array.isArray(value.items)
}

/** Shown when a draft was written by a version of the app that no longer fits. */
export const STALE_DRAFT_MESSAGE =
  'This draft was saved by an older version of the app and can no longer be opened. Please enter it again.'
