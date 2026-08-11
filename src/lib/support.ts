// The support line, in one place.
//
// It appears in three shapes: as a local number people read, as an
// international number WhatsApp needs, and as a tel: link. Defining it once
// keeps them from drifting apart, which is what happened before - the WhatsApp
// button pointed at a placeholder while the checkout screens showed a real
// number from platform settings.
export const SUPPORT_NUMBER = '01719731884'

// WhatsApp wants the country code and no leading zero.
export const SUPPORT_WHATSAPP_INTL = '8801719731884'

// A number the super admin has configured in Settings wins; this is the
// fallback for screens that render before those settings load, or when the
// field was left empty.
export const supportNumberOrFallback = (configured?: string | null): string => {
  const trimmed = String(configured || '').trim()
  return trimmed || SUPPORT_NUMBER
}

// Turns any of the shapes above into the digits WhatsApp expects: strip
// everything that is not a digit, then swap a local leading 0 for 880.
export const toWhatsAppNumber = (value?: string | null): string => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return SUPPORT_WHATSAPP_INTL
  if (digits.startsWith('880')) return digits
  if (digits.startsWith('0')) return `88${digits}`
  return digits
}

export const whatsAppLink = (value?: string | null, message?: string): string => {
  const text = message ?? 'Hi, I need help with my Furniture Management account.'
  return `https://wa.me/${toWhatsAppNumber(value)}?text=${encodeURIComponent(text)}`
}
