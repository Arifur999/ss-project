// Bangladeshi mobile number validation, shared across every create/edit form.
// Valid = 11 digits starting with 01 (spaces/dashes ignored).
export const INVALID_PHONE_MESSAGE = 'Enter a valid 11-digit number (e.g. 01XXXXXXXXX)'

export const isValidBdPhone = (phone: string) =>
  /^01[0-9]{9}$/.test(String(phone || '').replace(/[\s-]/g, ''))
