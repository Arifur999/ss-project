import React from 'react'
import { GlobeIcon as Globe } from '@phosphor-icons/react'
import { Lang } from '../context/LanguageContext'

interface AuthShellProps {
  /** Public image URL for the left brand panel (e.g. "/auth-login.jpg"). */
  image: string
  imageAlt: string
  brandName: string
  heading: string
  subtitle: string
  lang: Lang
  setLang: (lang: Lang) => void
  /**
   * Gives the form panel more room. Registration asks for six fields, four of
   * them paired two to a row, which the default width squeezes badly; sign-in
   * and forgot-password are a couple of stacked fields and read better narrow.
   */
  wide?: boolean
  children: React.ReactNode
}

/**
 * Split-screen auth layout (SkillHub-style): a full-height brand image with a
 * dark overlay + marketing copy on the left, and a white form panel on the
 * right. On mobile/tablet the image panel is hidden and only the form shows.
 * The image is loaded as a CSS background from /public, so if the file is not
 * present yet the panel simply falls back to the dark base colour + overlay.
 */
export default function AuthShell({ image, imageAlt, brandName, heading, subtitle, lang, setLang, wide = false, children }: AuthShellProps) {
  // Widening the form takes three things together: a bigger card, a larger
  // share of it for the form column, and a higher cap on the form itself.
  // Raising only the last one does nothing, because the column it sits in is
  // still half of max-w-6xl minus the padding.
  const cardWidth = wide ? 'max-w-7xl' : 'max-w-6xl'
  const columns = wide ? 'lg:grid-cols-[0.85fr_1.15fr]' : 'lg:grid-cols-2'
  const formWidth = wide ? 'max-w-xl' : 'max-w-sm'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef0f6] p-3 sm:p-6">
      <div className={`grid w-full ${cardWidth} overflow-hidden rounded-3xl bg-white shadow-[0_24px_70px_-20px_rgba(15,23,42,0.30)] lg:min-h-[660px] ${columns}`}>
        {/* Left: brand image + overlay copy (desktop only) */}
        <div className="relative hidden bg-slate-900 lg:block">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${image})` }}
            role="img"
            aria-label={imageAlt}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/40" />
          <div className="relative z-10 flex h-full flex-col justify-between p-10 text-white">
            <img src="/logo-light.png" alt={brandName} className="h-8 w-auto self-start object-contain" />
            <div>
              <h1 className="text-3xl font-black leading-tight xl:text-[34px]">{heading}</h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">{subtitle}</p>
            </div>
          </div>
        </div>

        {/* Right: form panel */}
        <div className="relative flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14">
          <div className="absolute right-5 top-5 flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            <Globe size={13} className="ml-1.5 text-slate-400" />
            <button
              onClick={() => setLang('en')}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${lang === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('bn')}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${lang === 'bn' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              বাংলা
            </button>
          </div>
          <div className={`mx-auto w-full ${formWidth}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
