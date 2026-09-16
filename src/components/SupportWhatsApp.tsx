import React, { useEffect, useState } from 'react'
import { WhatsappLogoIcon as WhatsappLogo } from '@phosphor-icons/react'
import { getPaymentInfo } from '../services/admin.services'
import { supportNumberOrFallback, whatsAppLink } from '../lib/support'

/**
 * The support line, one tap away from every page.
 *
 * Same number the Pending Approval screen and the plans page already show -
 * platform_settings.support_number, which the super admin can change without a
 * deploy, falling back to lib/support.ts when it has not loaded yet or was left
 * blank. Reaching it used to mean finding a screen that happened to print it.
 *
 * Rendered as an anchor rather than a button so it behaves like a link: middle
 * click, long press, copy address all work, and WhatsApp opens in its own tab
 * instead of navigating the app away mid-invoice.
 */
export default function SupportWhatsApp() {
  const [supportNumber, setSupportNumber] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // A failure here is not worth a toast: the fallback number is a real one,
    // so the button still works and nothing on the page depends on this.
    getPaymentInfo()
      .then(info => { if (!cancelled) setSupportNumber(info?.support_number ?? null) })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  const number = supportNumberOrFallback(supportNumber)

  return (
    <a
      href={whatsAppLink(number)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Support on WhatsApp - ${number}`}
      aria-label={`Support on WhatsApp, ${number}`}
      className="rounded-full p-2 text-neutral-500 transition-colors hover:bg-emerald-50 hover:text-[#25D366]"
    >
      <WhatsappLogo size={20} />
    </a>
  )
}
