import React from 'react'
import { PlayCircleIcon as PlayCircle } from '@phosphor-icons/react'
import PageHeader from '../../components/PageHeader'
import { useLang } from '../../context/LanguageContext'

/**
 * Guideline videos - the shell, waiting on its content.
 *
 * The page exists now so the Support section has both its halves and the nav
 * does not lead anywhere broken. What goes in it, and where the videos are
 * kept, is still to be decided; nothing here pretends otherwise, so nobody
 * reads an empty page as a page that failed to load.
 */
export default function GuidelineVideos() {
  const { lang } = useLang()
  const bn = lang === 'bn'

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title={bn ? 'গাইডলাইন ভিডিও' : 'Guideline Video'}
        subtitle={bn ? 'সফটওয়্যার ব্যবহারের ভিডিও নির্দেশনা' : 'Short videos showing how to use the software'}
      />

      <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
        <PlayCircle size={44} className="text-slate-300" />
        <p className="max-w-md text-sm text-slate-500">
          {bn
            ? 'ভিডিওগুলো শিগগিরই এখানে যোগ করা হবে। ততক্ষণ কিছু জানার থাকলে সাপোর্ট টিকেট থেকে জিজ্ঞেস করুন।'
            : 'Videos are being added here soon. Until then, ask anything through a support ticket.'}
        </p>
      </div>
    </div>
  )
}
