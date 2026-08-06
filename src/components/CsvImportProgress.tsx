import { useEffect } from 'react'
import { FileSpreadsheet, CheckCircle2 } from 'lucide-react'

// Progress dialog for a CSV import.
//
// Deliberately has no way to close it: no close button, no backdrop click, and
// Escape is swallowed. An import writes rows in batches, so dismissing it
// halfway would leave the operator staring at a half-loaded list with no idea
// how much went in. It disappears on its own once the import finishes.

export type CsvImportPhase = 'reading' | 'checking' | 'saving' | 'done'

const PHASE_LABEL: Record<CsvImportPhase, string> = {
  reading: 'Reading the file',
  checking: 'Checking the rows',
  saving: 'Saving',
  done: 'Finished',
}

export type CsvImportState = {
  open: boolean
  fileName: string
  phase: CsvImportPhase
  processed: number
  total: number
}

export const idleCsvImport: CsvImportState = {
  open: false,
  fileName: '',
  phase: 'reading',
  processed: 0,
  total: 0,
}

export default function CsvImportProgress({ state }: { state: CsvImportState }) {
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

  if (!state.open) return null

  const done = state.phase === 'done'
  // Before the row count is known there is nothing honest to show as a
  // percentage, so the bar sits at a small width rather than claiming progress.
  const percent = done
    ? 100
    : state.total > 0
      ? Math.min(100, Math.round((state.processed / state.total) * 100))
      : 0

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-live="polite">
      {/* No onClick: clicking outside must not dismiss an import in progress. */}
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-700'}`}>
            {done ? <CheckCircle2 size={22} /> : <FileSpreadsheet size={22} />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900">
              {done ? 'Import complete' : 'Importing CSV'}
            </h3>
            <p className="mt-1 truncate text-sm text-slate-500" title={state.fileName}>
              {state.fileName}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">
              {PHASE_LABEL[state.phase]}
              {state.phase === 'saving' && state.total > 0 && (
                <span className="text-slate-500">
                  {' '}
                  {state.processed.toLocaleString()} of {state.total.toLocaleString()}
                </span>
              )}
            </span>
            <span className="tabular-nums font-semibold text-slate-900">{percent}%</span>
          </div>

          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${done ? 'bg-emerald-500' : 'bg-ink'}`}
              style={{ width: `${Math.max(percent, 4)}%` }}
            />
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          {done
            ? 'Closing…'
            : 'Please keep this window open until the import finishes. Closing it now could leave only part of your file saved.'}
        </p>
      </div>
    </div>
  )
}
