import type { DamageAction, DamageReceiveResult, DamageSource, DamageStatus } from '../../services/damage.services'

// The server's copy of these rules is hatim_Backend/src/app/shared/damageStatus.ts.
// They are written twice on purpose - the form has to grey a field out before
// the request is sent, and the server has to refuse it whatever the form did -
// but they must agree, so both sides keep the same names and the same shape.

/**
 * Whether this entry has to name a supplier.
 *
 * Five of the six combinations do: goods that ARRIVED broken came from
 * somebody, and goods being returned or exchanged are going back to somebody.
 * Only own-stock repair is free of it, because a chair broken in the showroom
 * usually goes to a local carpenter who is not a supplier at all.
 */
export function needsSupplier(source: DamageSource, action: DamageAction): boolean {
  return source === 'supplier' || action === 'return' || action === 'exchange'
}

/** Repaired and replaced come back to the shelf; scrapped is gone for good. */
export function returnsStock(result: DamageReceiveResult): boolean {
  return result === 'repaired' || result === 'replaced'
}

export const SOURCE_LABELS: Record<DamageSource, string> = {
  own_stock: 'Own stock',
  supplier: 'Came damaged',
}

export const ACTION_LABELS: Record<DamageAction, string> = {
  repair: 'Repair',
  return: 'Return',
  exchange: 'Change',
}

export const RESULT_LABELS: Record<DamageReceiveResult, string> = {
  repaired: 'Repaired',
  replaced: 'Replaced',
  scrapped: 'Scrapped',
}

/** Status pill classes, matching the badge vocabulary used elsewhere. */
export const STATUS_BADGE: Record<DamageStatus, string> = {
  pending: 'bg-brand-blue-soft text-brand-blue',
  partial: 'bg-orange-50 text-brand-orange',
  completed: 'bg-green-50 text-brand-green',
}

export const STATUS_LABELS: Record<DamageStatus, string> = {
  pending: 'Out',
  partial: 'Partly back',
  completed: 'Settled',
}

/** What is still to come back on a line. */
export function outstandingQty(item: { qty: number; received_qty: number }): number {
  return Math.max(0, Number(item.qty || 0) - Number(item.received_qty || 0))
}
