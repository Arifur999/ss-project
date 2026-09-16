import { describe, it, expect } from 'vitest'
import { canSendSms, isPermissionError, smsFailureMessage } from './smsPermission'
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
    expect(isPermissionError(new ApiError('Not enough SMS credits', 400))).toBe(false)
    expect(isPermissionError(new Error('Network Error'))).toBe(false)
    expect(isPermissionError(null)).toBe(false)
  })
})

describe('smsFailureMessage', () => {
  it('says the invoice is safe and who can send', () => {
    expect(smsFailureMessage(new ApiError('Forbidden access!', 403), 'Invoice saved'))
      .toBe('Invoice saved. SMS not sent - only the owner can send SMS.')
  })

  it('passes a real failure through, still naming what was saved', () => {
    expect(smsFailureMessage(new ApiError('Not enough SMS credits', 400), 'Invoice saved'))
      .toBe('Invoice saved, but the SMS failed: Not enough SMS credits.')
  })

  it('still names what was saved when the error says nothing', () => {
    expect(smsFailureMessage({}, 'Invoice saved'))
      .toBe('Invoice saved, but the SMS could not be sent.')
  })
})
