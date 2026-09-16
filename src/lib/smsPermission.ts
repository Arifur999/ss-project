import { ApiError } from './httpClient'

// Who may spend the workspace's SMS credits, and what to say when someone who
// may not tries.
//
// The gate is on the server: every /sms route is owner-only, because the
// credits are bought against the owner's wallet and a staff account running
// through them would be spending money it has no view of. That is deliberate
// and stays.
//
// What was wrong is what a staff member SAW. Seven pages send SMS as a side
// effect of saving something - an invoice, a loan receipt, a due collection -
// and each one reported the failure with `error.message`, which for a 403 is
// the server's "Forbidden access! You do not have permission to access this
// resource." So a sales assistant saved an invoice perfectly well and was told
// they were forbidden, with nothing to say the invoice was fine or which part
// had failed.

/** Only the owner can spend SMS credits - the same rule every /sms route enforces. */
export function canSendSms(role?: string | null): boolean {
  return role === 'owner'
}

/**
 * Whether a thrown error is the server refusing on role grounds.
 *
 * Checked by status rather than by message, so it keeps working if the wording
 * changes. The message is checked too, because the supabase shim in front of
 * some of these calls throws a plain Error carrying only the text.
 */
export function isPermissionError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 403) return true
  return error instanceof Error && /forbidden|permission/i.test(error.message)
}

/**
 * What to tell somebody whose SMS did not go out.
 *
 * `saved` names the thing that DID succeed, because that is the first question
 * the person asking has: the invoice is on the books, only the text message
 * was refused.
 */
export function smsFailureMessage(error: unknown, saved: string): string {
  if (isPermissionError(error)) {
    return `${saved}. SMS not sent - only the owner can send SMS.`
  }
  const detail = error instanceof Error ? error.message : ''
  return detail ? `${saved}, but the SMS failed: ${detail}.` : `${saved}, but the SMS could not be sent.`
}
