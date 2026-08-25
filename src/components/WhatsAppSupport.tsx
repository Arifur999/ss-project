import React from 'react'
import { whatsAppLink } from '../lib/support'

/**
 * The floating WhatsApp button.
 *
 * It lives on the signed-out screens only. Inside the app it was a dead end:
 * a message arriving on WhatsApp carried a phone number and nothing else - no
 * way to tell which workspace was asking or what had already been said. Signed-in
 * users go to Support > Support Ticket instead, which carries all of that.
 * Somebody who cannot get as far as logging in has no ticket page to reach, so
 * here the button is still the only way through.
 */
export default function WhatsAppSupport() {
  // The number itself lives in lib/support.ts so it is defined in one place.
  const href = whatsAppLink()
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat with support on WhatsApp"
      aria-label="Chat with support on WhatsApp"
      className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] py-3 pl-3 pr-3 text-white shadow-lg shadow-green-600/30 transition hover:bg-[#20bd5a] hover:pr-4"
    >
      <svg viewBox="0 0 32 32" width="24" height="24" fill="currentColor" aria-hidden="true">
        <path d="M16.01 3C9.38 3 4 8.37 4 15c0 2.1.55 4.15 1.6 5.96L4 29l8.24-1.56A12.9 12.9 0 0 0 16 27c6.63 0 12-5.37 12-12S22.64 3 16.01 3zm0 21.8c-1.9 0-3.77-.5-5.4-1.46l-.39-.23-4.9.93.93-4.78-.25-.4A9.77 9.77 0 0 1 6.2 15c0-5.4 4.4-9.8 9.8-9.8 5.42 0 9.82 4.4 9.82 9.8s-4.4 9.8-9.81 9.8zm5.6-7.34c-.3-.15-1.8-.9-2.08-1-.28-.1-.48-.15-.68.15-.2.3-.78 1-.96 1.2-.18.2-.35.22-.65.08-.3-.15-1.28-.47-2.44-1.5-.9-.8-1.5-1.8-1.68-2.1-.18-.3-.02-.46.13-.6.13-.13.3-.34.45-.5.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.5-.5-.68-.5l-.58-.01c-.2 0-.52.07-.8.37-.28.3-1.05 1.02-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.55.72.3 1.28.48 1.71.62.72.23 1.37.2 1.9.12.58-.09 1.8-.74 2.05-1.45.25-.72.25-1.33.18-1.46-.07-.13-.27-.2-.57-.35z" />
      </svg>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover:max-w-[90px] group-hover:opacity-100">Support</span>
    </a>
  )
}
