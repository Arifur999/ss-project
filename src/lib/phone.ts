// Bangladeshi mobile number validation, shared across every create/edit form.
// Valid = 11 digits starting with 01 (spaces/dashes ignored).
export const INVALID_PHONE_MESSAGE = 'Enter a valid 11-digit number (e.g. 01XXXXXXXXX)'

export const isValidBdPhone = (phone: string) =>
  /^01[0-9]{9}$/.test(String(phone || '').replace(/[\s-]/g, ''))

/**
 * The digits alone, for deciding whether two numbers are the same one.
 *
 * The same phone gets typed "01712-345678", "01712 345678" and "01712345678"
 * on different days, and a plain string comparison would let all three onto
 * the customer list as separate people.
 */
export const normalizePhone = (phone: string) => String(phone || '').replace(/\D/g, '')

export const DUPLICATE_PHONE_MESSAGE = 'This number already belongs to another customer'
