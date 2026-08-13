import { useEffect } from 'react'
import { CheckCircleIcon as CheckCircle2, CircleNotchIcon as Loader2 } from '@phosphor-icons/react'

// Progress dialog for anything that takes long enough to look like a hang:
// importing a spreadsheet, deleting a batch of rows, and so on.
//
// Deliberately has no way to close it - no close button, no backdrop click,
// Escape swallowed. These jobs write in batches, so dismissing one half way
// would leave the operator staring at a partly-changed list with no idea how
// much went through. It disappears on its own when the work finishes.
//
// While it is open it also guards against leaving the page, because a reload
// mid-import stops the work exactly where it stood.

export type ProgressState = {
  open: boolean
  /** Dialog heading, e.g. "Importing products". */
  title: string
  /** Line under the heading - a file name, a row count. */
  subtitle: string
  /** What is happening right now, e.g. "Saving products". */
  step: string
  processed: number
  /** 0 while the size of the job is still unknown; the bar then shows as busy. */
  total: number
  done: boolean
}

export const idleProgress: ProgressState = {
  open: false,
  title: '',
  subtitle: '',
  step: '',
  processed: 0,
  total: 0,
  done: false,
}

export function startProgress(title: string, subtitle: string, step: string): ProgressState {
  return { open: true, title, subtitle, step, processed: 0, total: 0, done: false }
}

export default function ProgressDialog({ state }: { state: ProgressState }) {
  const running = state.open && !state.done

  // Escape closes most dialogs in this app; here it must do nothing.
  useEffect(() => {
    if (!state.open) return
    const swallowEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('keydown', swallowEscape, true)
    return () => window.removeEventListener('keydown', swallowEscape, true)
  }, [state.open])

  // A reload or a closed tab kills the job where it stands, and the rows
  // already written stay written. The browser will not let us block that, but
  // it will ask first if we mark the page as having work in progress.
  useEffect(() => {
    if (!running) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

  if (!state.open) return null

  const known = state.total > 0
  const percent = state.done
    ? 100
    : known
      ? Math.min(100, Math.round((state.processed / state.total) * 100))
      : 0

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-live="polite">
      {/* No onClick: clicking outside must not dismiss work in progress. */}
      {/* Dim only - see the note in Modal.tsx. This one matters twice over: a
          long import repaints the progress bar constantly, and each repaint
          would re-blur the whole page behind it. */}
      <div className="absolute inset-0 bg-slate-950/55" />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${state.done ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-700'}`}>
            {state.done ? <CheckCircle2 size={22} /> : <Loader2 size={22} className="animate-spin" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900">{state.done ? 'Finished' : state.title}</h3>
            {state.subtitle && (
              <p className="mt-1 truncate text-sm text-slate-500" title={state.subtitle}>{state.subtitle}</p>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-slate-700">
              {state.step}
              {known && !state.done && (
                <span className="text-slate-500">
                  {' '}{state.processed.toLocaleString()} of {state.total.toLocaleString()}
                </span>
              )}
            </span>
            {(known || state.done) && (
              <span className="tabular-nums font-semibold text-slate-900">{percent}%</span>
            )}
          </div>

          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {known || state.done ? (
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${state.done ? 'bg-emerald-500' : 'bg-ink'}`}
                style={{ width: `${Math.max(percent, 4)}%` }}
              />
            ) : (
              // Size not known yet - show it as busy rather than claiming a
              // percentage that would be made up.
              <div className="h-full w-1/3 animate-pulse rounded-full bg-ink" />
            )}
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          {state.done
            ? 'Closing…'
            : 'Please keep this window open until it finishes. Reloading or closing the tab now would stop it part way.'}
        </p>
      </div>
    </div>
  )
}
