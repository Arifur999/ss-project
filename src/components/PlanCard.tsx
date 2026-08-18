import React from 'react'
import { CheckCircleIcon as CheckCircle, XCircleIcon as XCircle } from '@phosphor-icons/react'

/**
 * One subscription plan, drawn the way the owner's reference does it: the icon
 * tile, the name and who it is for, the price, then the call to action, and the
 * feature list underneath it.
 *
 * The list carries both halves - what the plan gives with a filled tick, and
 * what it does not with a hollow cross - so a reader can see what the next plan
 * up would add without opening it.
 *
 * Used by /current-plan and /choose-plan; the two pages differ only in which
 * button they show and what it does.
 */
export type PlanCardProps = {
  icon: React.ReactNode
  title: string
  tagline: string
  /** The figure itself, e.g. "Tk 599" or "Free". */
  price: string
  /** What the figure buys, e.g. "/ month". Sits small and grey beside it. */
  period?: string
  /** Struck-through regular price, when the plan is discounted. */
  originalPrice?: string
  discountLabel?: string
  included: string[]
  missing: string[]
  buttonLabel: string
  /** Small grey line under the button - why it is disabled, or a caveat. */
  note?: string
  onSelect?: () => void
  disabled?: boolean
  /** Draws the corner ribbon and the blue accent. */
  popular?: boolean
  popularLabel?: string
  /** The plan the owner is on right now: green edge, no action. */
  isCurrent?: boolean
  currentLabel?: string
}

export default function PlanCard({
  icon, title, tagline, price, period, originalPrice, discountLabel,
  included, missing, buttonLabel, note, onSelect, disabled, popular, popularLabel,
  isCurrent, currentLabel,
}: PlanCardProps) {
  const buttonDisabled = Boolean(disabled || isCurrent)
  const accent = popular ? 'text-brand-blue' : 'text-navy-900'

  const buttonClass = isCurrent
    ? 'bg-brand-green-soft text-brand-green cursor-default'
    : disabled
      ? 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
      : 'bg-navy-900 text-white hover:bg-black'

  return (
    <section
      className={`relative flex flex-col overflow-hidden rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(15,17,23,0.04),0_10px_30px_rgba(15,17,23,0.07)] ring-1 ${
        isCurrent ? 'ring-brand-green' : popular ? 'ring-navy-900/10' : 'ring-neutral-200/70'
      }`}
    >
      {/* A corner ribbon rather than a floating pill: it cannot collide with
          the icon tile or the title however long the plan's name gets. */}
      {isCurrent ? (
        <span className="absolute -right-9 top-5 w-32 rotate-45 bg-brand-green py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">
          {currentLabel}
        </span>
      ) : popular ? (
        <span className="absolute -right-9 top-5 w-32 rotate-45 bg-brand-blue py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">
          {popularLabel}
        </span>
      ) : null}

      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 text-navy-900">
        {icon}
      </div>

      <h3 className="text-2xl font-bold leading-tight text-navy-900">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500">{tagline}</p>

      <div className="mt-5">
        {originalPrice && (
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-300 line-through">{originalPrice}</span>
            {discountLabel && (
              <span className="rounded-full bg-brand-green-soft px-2 py-0.5 text-[11px] font-bold text-brand-green">{discountLabel}</span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-4xl font-bold tracking-tight text-navy-900">{price}</span>
          {period && <span className="text-sm text-neutral-500">{period}</span>}
        </div>
      </div>

      <button
        type="button"
        onClick={buttonDisabled ? undefined : onSelect}
        disabled={buttonDisabled}
        className={`mt-6 w-full rounded-2xl px-4 py-3.5 text-sm font-semibold transition-colors ${buttonClass}`}
      >
        {buttonLabel}
      </button>

      {note && <p className="mt-2 text-center text-xs leading-relaxed text-neutral-500">{note}</p>}

      <ul className="mt-7 space-y-3.5">
        {included.map(feature => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-neutral-700">
            <CheckCircle size={18} weight="fill" className={`mt-px shrink-0 ${accent}`} />
            <span>{feature}</span>
          </li>
        ))}
        {/* What this plan does not carry. Same list, deliberately quieter - it
            should be readable, not the first thing the eye lands on. */}
        {missing.map(feature => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-neutral-500">
            <XCircle size={18} weight="fill" className="mt-px shrink-0 text-neutral-300" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
