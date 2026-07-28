import React from 'react'
import { Globe } from 'lucide-react'
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
  children: React.ReactNode
}

/**
 * Split-screen auth layout (SkillHub-style): a full-height brand image with a
 * dark overlay + marketing copy on the left, and a white form panel on the
 * right. On mobile/tablet the image panel is hidden and only the form shows.
 * The image is loaded as a CSS background from /public, so if the file is not
 * present yet the panel simply falls back to the dark base colour + overlay.
 */
export default function AuthShell({ image, imageAlt, brandName, heading, subtitle, lang, setLang, children }: AuthShellProps) {
  const initial = (brandName.trim()[0] || 'B').toUpperCase()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef0f6] p-3 sm:p-6">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-[0_24px_70px_-20px_rgba(15,23,42,0.30)] lg:min-h-[660px] lg:grid-cols-2">
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
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-base font-black text-slate-900">{initial}</span>
              <span className="text-lg font-bold tracking-tight">{brandName}</span>
            </div>
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
          <div className="mx-auto w-full max-w-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
