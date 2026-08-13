import { useLang } from '../context/LanguageContext'

/**
 * Two markers for cells that have nothing to show, kept apart on purpose.
 *
 * A bare em-dash was doing both jobs, and in an accounting table the two
 * readings are not the same claim. "This account moved no money" is a figure
 * the books assert; "we have no value for this" is the absence of one. Showing
 * the same glyph for both leaves the reader guessing which they are looking at.
 *
 * So: a real zero prints as a muted Tk 0 - still a number, just quiet enough
 * not to compete with the figures that matter. A genuinely missing value gets
 * a small grey dot, which cannot be misread as an amount.
 */

/** A known zero. Prints the currency's own zero, dimmed. */
export function ZeroAmount() {
  const { formatCurr } = useLang()
  return <span className="text-neutral-400">{formatCurr(0)}</span>
}

/** No value on record - not a zero. */
export function NoValue({ label }: { label?: string }) {
  const { t } = useLang()
  const text = label || t('common_noValue')
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-300 align-middle"
      role="img"
      aria-label={text}
      title={text}
    />
  )
}
