import { ApiError } from './httpClient'

// Who may spend the workspace's SMS credits, and what to say whenever a send
// does not go out.
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
//
// The same raw passthrough put "Gateway balance insufficient" on the screen
// beside a green "Payment saved!". Three different things go wrong here - the
// role, the shop's own credits, the gateway - and only one of them is the
// reader's to fix. So they are told apart below rather than reprinted.

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
 * Whether the workspace's own credit wallet came up short.
 *
 * 402 is what the send route answers with when the conditional decrement finds
 * fewer credits than the batch needs. The wording is checked as well, for the
 * same reason as above.
 */
export function isCreditError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 402) return true
  return error instanceof Error && /not enough sms credits/i.test(error.message)
}

/**
 * Whether the SMS gateway itself refused, rather than anything about this
 * workspace.
 *
 * This is the case worth separating. MRAM answers a numeric code the server
 * turns into text - "Gateway balance insufficient" (the PLATFORM's account with
 * MRAM has run dry), "Sender ID / masking not found", "SPAM detected" - and the
 * shop reading the toast can do nothing about any of them. Worse, the first one
 * reads exactly like "you have run out of SMS", which is a different problem
 * with a different fix, so the operator goes and buys credits they already have.
 *
 * On any of these the server puts the reserved credits back before it throws
 * (sms.service.ts), so the one thing the reader needs to hear is that the send
 * cost them nothing.
 */
export function isGatewayError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 502) return true
  return error instanceof Error && /gateway/i.test(error.message)
}

// Trailing punctuation off the server's sentence, so it can sit inside ours.
const trimStop = (text: string) => text.trim().replace(/[.\s]+$/, '')

/**
 * Why the SMS did not go out, as a clause - no leading capital, no full stop -
 * so a caller can set it in a sentence of its own making.
 */
export function smsFailureReason(error: unknown): string {
  if (isPermissionError(error)) return 'only the owner can send SMS'
  if (isCreditError(error)) return 'not enough SMS credits - buy more from Marketing > Buy SMS'
  const detail = error instanceof Error ? trimStop(error.message) : ''
  if (isGatewayError(error)) {
    // The raw gateway text is kept: it is meaningless to the shop but it is the
    // only thing that tells whoever runs the platform which knob to turn.
    return detail
      ? `the SMS gateway refused it (${detail}) and no credits were used`
      : 'the SMS gateway refused it and no credits were used'
  }
  return detail || 'the message could not be sent'
}

/**
 * What to tell somebody whose SMS did not go out.
 *
 * `saved` names the thing that DID succeed, because that is the first question
 * the person asking has: the invoice is on the books, only the text message
 * failed. Leave it out where the SMS was the whole errand and nothing else was
 * at stake.
 */
export function smsFailureMessage(error: unknown, saved?: string): string {
  const lead = saved ? `${saved}. ` : ''
  return `${lead}SMS not sent - ${smsFailureReason(error)}.`
}
