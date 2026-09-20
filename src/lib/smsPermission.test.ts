import { describe, it, expect } from 'vitest'
import { canSendSms, isCreditError, isGatewayError, isPermissionError, smsFailureMessage, smsFailureReason } from './smsPermission'
import { ApiError } from './httpClient'

// The message a staff member reads when an invoice saved but its SMS did not.
// They used to be shown the server's raw "Forbidden access! You do not have
// permission to access this resource." with nothing to say the invoice itself
// was fine - so the first thing every case here checks is that the saved thing
// is still named.

describe('canSendSms', () => {
  it('is the owner alone, matching the gate on every /sms route', () => {
    expect(canSendSms('owner')).toBe(true)
    expect(canSendSms('manager')).toBe(false)
    expect(canSendSms('sales_staff')).toBe(false)
    expect(canSendSms('accountant')).toBe(false)
    expect(canSendSms(undefined)).toBe(false)
  })
})

describe('isPermissionError', () => {
  it('recognises a 403 by its status, not its wording', () => {
    expect(isPermissionError(new ApiError('anything at all', 403))).toBe(true)
  })

  it('recognises the message too, for calls that lose the status', () => {
    // The supabase shim in front of some of these throws a plain Error.
    expect(isPermissionError(new Error('Forbidden access! You do not have permission'))).toBe(true)
  })

  it('leaves other failures alone', () => {
    expect(isPermissionError(new ApiError('Gateway balance insufficient', 502))).toBe(false)
    expect(isPermissionError(new Error('Network Error'))).toBe(false)
    expect(isPermissionError(null)).toBe(false)
  })
})


describe('isCreditError', () => {
  it('is the 402 the send route answers when the wallet is short', () => {
    expect(isCreditError(new ApiError('Not enough SMS credits. This batch needs 3', 402))).toBe(true)
    expect(isCreditError(new Error('Not enough SMS credits'))).toBe(true)
  })

  it('is not the gateway running dry, which reads almost the same', () => {
    expect(isCreditError(new ApiError('Gateway balance insufficient', 502))).toBe(false)
  })
})

describe('isGatewayError', () => {
  it('is the 502 the send route answers when MRAM refuses', () => {
    expect(isGatewayError(new ApiError('Gateway balance insufficient', 502))).toBe(true)
    expect(isGatewayError(new ApiError('SPAM detected', 502))).toBe(true)
  })

  it('leaves the shop side of it alone', () => {
    expect(isGatewayError(new ApiError('Not enough SMS credits', 402))).toBe(false)
    expect(isGatewayError(new ApiError('Forbidden access!', 403))).toBe(false)
  })
})

describe('smsFailureMessage', () => {
  it('says the invoice is safe and who can send', () => {
    expect(smsFailureMessage(new ApiError('Forbidden access!', 403), 'Invoice saved'))
      .toBe('Invoice saved. SMS not sent - only the owner can send SMS.')
  })

  // The one that started this: a red "Gateway balance insufficient" landed
  // beside a green "Payment saved!", and the two together read as though the
  // payment had half-failed and the shop's SMS pack had run out. Neither was
  // true - the server had already refunded the reserved credits.
  it('names the payment, blames the gateway, and clears the credits', () => {
    expect(smsFailureMessage(new ApiError('Gateway balance insufficient', 502), 'Payment saved'))
      .toBe('Payment saved. SMS not sent - the SMS gateway refused it (Gateway balance insufficient) and no credits were used.')
  })

  it('points an empty wallet at the page that refills it', () => {
    expect(smsFailureMessage(new ApiError('Not enough SMS credits. This batch needs 3.', 402), 'Payment saved'))
      .toBe('Payment saved. SMS not sent - not enough SMS credits - buy more from Marketing > Buy SMS.')
  })

  it('passes an unclassified failure through, still naming what was saved', () => {
    expect(smsFailureMessage(new ApiError('Network Error', undefined), 'Invoice saved'))
      .toBe('Invoice saved. SMS not sent - Network Error.')
  })

  it('still names what was saved when the error says nothing', () => {
    expect(smsFailureMessage({}, 'Invoice saved'))
      .toBe('Invoice saved. SMS not sent - the message could not be sent.')
  })

  it('drops the lead where the SMS was the whole errand', () => {
    expect(smsFailureMessage(new ApiError('Gateway balance insufficient', 502)))
      .toBe('SMS not sent - the SMS gateway refused it (Gateway balance insufficient) and no credits were used.')
  })
})

describe('smsFailureReason', () => {
  it('is a clause, so a caller can build its own sentence round it', () => {
    expect(smsFailureReason(new ApiError('Forbidden access!', 403))).toBe('only the owner can send SMS')
  })
})
