import React from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../context/LanguageContext'

export type LegalSection = { heading: string; body: (string | string[])[] }

/**
 * The frame the public legal pages share - readable signed in or out, as the
 * app stores require of the links they are given: the product's name, the
 * page's title and date, its sections, and a switch between the two
 * languages. A string is a paragraph; an array is a bulleted list.
 */
export default function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
}) {
  const { lang, setLang } = useLang()
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="text-lg font-bold text-slate-900">Furnify</Link>
          <button
            type="button"
            onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {lang === 'bn' ? 'English' : 'বাংলা'}
          </button>
        </div>

        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{updated}</p>
        <p className="mt-6 leading-relaxed text-slate-700">{intro}</p>

        {sections.map(section => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-xl font-semibold text-slate-900">{section.heading}</h2>
            {section.body.map((block, index) =>
              Array.isArray(block) ? (
                <ul key={index} className="mt-3 list-disc space-y-1.5 pl-6 text-slate-700">
                  {block.map(item => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p key={index} className="mt-3 leading-relaxed text-slate-700">{block}</p>
              ),
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
