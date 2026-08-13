import React from 'react'
import { ArrowClockwise, Warning } from '@phosphor-icons/react'

/**
 * Catches a crash inside a page and shows something a person can act on.
 *
 * Without this, one thrown error unmounts the whole React tree and the browser
 * is left showing a white rectangle - no message, no menu, no way back. The
 * quality check on every push cannot prevent that: it type-checks, lints,
 * tests and builds, all of which happen before the code ever meets real data.
 * A missing column on one row is enough, and only the owner ever sees it.
 *
 * The sidebar and header live outside this boundary, so a broken page leaves
 * the rest of the app usable.
 *
 * `resetKey` is the current path. Navigating clears a caught error so the next
 * page gets a chance to draw. It is deliberately a prop rather than a `key` on
 * the element: a changing key remounts the children, and two routes can share
 * one component - Sales Ledger and New Sale are both <Sales /> - so remounting
 * threw away the invoice the ledger's edit button had just loaded into the
 * form, and the owner landed on a blank new sale.
 */
type Props = { children: React.ReactNode; resetKey?: string }
type State = { error: Error | null }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept in the console so the message is recoverable from a support call.
    console.error('Page crashed:', error, info.componentStack)
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-red-soft text-brand-red">
            <Warning size={26} />
          </div>
          <h2 className="text-lg font-bold text-navy-900">This page could not be shown</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Something went wrong while drawing this screen. Nothing you have saved is affected -
            your data is on the server, not here.
          </p>

          <div className="mt-6 flex justify-center gap-2">
            <button type="button" onClick={() => this.setState({ error: null })} className="btn-secondary">
              <ArrowClockwise size={15} /> Try again
            </button>
            <button type="button" onClick={() => window.location.reload()} className="btn-primary">
              Reload
            </button>
          </div>

          {/* The message itself, for reading out over the phone. */}
          <p className="mt-5 break-words rounded-lg bg-white px-3 py-2 text-left font-mono text-[11px] text-neutral-500">
            {this.state.error.message || String(this.state.error)}
          </p>
        </div>
      </div>
    )
  }
}
