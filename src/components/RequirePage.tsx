import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LockKeyIcon as LockKey, ArrowClockwiseIcon as Retry } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { allowedPages, guardVerdict, permissionLabel, ROUTE_ACCESS } from '../lib/permissions'

/**
 * The private route this app never had.
 *
 * Until this existed, App.tsx checked three things - loading, signed in, and the
 * subscription - and never once imported permissions.ts. The sidebar hid links a
 * user could not use, and that was the whole of it: typing /balance in the address
 * bar rendered the Balance page, and typing /user-management rendered the entire
 * User Management screen to any signed-in staff member. The menu was a suggestion.
 *
 * ---------------------------------------------------------------------------
 * Where this sits, and why
 * ---------------------------------------------------------------------------
 * Inside Layout, around <Outlet/>. Not wrapping <Layout/>: a refusal has to keep
 * the sidebar, the header and the sign-out button, because a person who lands on
 * one needs somewhere to go next. A guard outside the shell blanks the chrome and
 * leaves them with a back button, which is how redirect loops get invented.
 *
 * One component rather than sixty-three wrappers, because every business route is
 * already a child of a single <Route element={<ProtectedRoute><Layout/></ProtectedRoute>}>.
 * Sixty-three wrappers is sixty-three chances to forget one.
 *
 * ---------------------------------------------------------------------------
 * It refuses by rendering, never by navigating
 * ---------------------------------------------------------------------------
 * There is no <Navigate> in here. That is deliberate: App.tsx has a catch-all
 * `*` that sends unknown paths to `/`, so a guard that redirected on refusal
 * could bounce a user between the two forever. With nothing to navigate, the
 * loop cannot be written.
 *
 * ---------------------------------------------------------------------------
 * This is the second line, not the first
 * ---------------------------------------------------------------------------
 * The server decides. requirePermission reads permissions from the database on
 * every request and never from the token, so nothing here can be the thing that
 * keeps data safe - a determined person can edit their own localStorage and get a
 * rendered page whose every request comes back 403. What this does is stop honest
 * people wandering into screens that were not meant for them, and stop the app
 * looking broken when they do.
 */
export default function RequirePage({ children }: { children: React.ReactNode }) {
  const { profile, loading, profileError } = useAuth()
  const location = useLocation()
  const path = location.pathname

  // The decision lives in lib/permissions as guardVerdict, where it is tested
  // without a DOM. What is left here is which of four things to draw.
  const verdict = guardVerdict({ loading, profile, profileError, path })

  if (verdict === 'wait') return <Centered><Spinner /></Centered>

  /**
   * Could not ask.
   *
   * The trap this exists for: AuthContext seeds `profile` from a localStorage
   * hint and calls setLoading(false) even when /auth/me failed for a reason that
   * was not a 401 - a deploy restarting the API, a dropped connection - while it
   * is still retrying in the background. So `!loading` does not mean "we know who
   * this is". A guard keyed on `!loading && !canReach(...)` would show "no
   * access" to a legitimate user every time the server hiccuped, and they would
   * reasonably conclude their account had been changed.
   *
   * Never a refusal here, and never a redirect. Just the truth: we cannot reach
   * the server, and we are trying again.
   */
  if (verdict === 'unreachable') {
    return (
      <Centered>
        <div className="max-w-sm text-center">
          <Retry size={30} className="mx-auto mb-3 animate-spin text-slate-300" />
          <h2 className="text-base font-bold text-slate-800">Can&apos;t reach the server</h2>
          <p className="mt-1 text-sm text-slate-500">
            Still trying. Nothing has changed about your account - this is the connection.
          </p>
        </div>
      </Centered>
    )
  }

  /**
   * A hint is good enough to decide on.
   *
   * The profile may have come out of localStorage with the server yet to confirm
   * it. Deciding on that is a stated trade, not an oversight: the hint exists so
   * a reload paints instantly, and blocking on the server would throw that away
   * to buy nothing, because forging the hint gets you a page whose every request
   * is refused anyway. When the real answer lands, this re-renders and decides
   * again - and bounces a forger then.
   */
  if (verdict === 'allow') return <>{children}</>

  const access = ROUTE_ACCESS[path]
  const needed = access && access !== 'all' && access !== 'owner' ? permissionLabel(access) : ''
  const elsewhere = allowedPages(profile?.role, profile?.permissions)

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-lg rounded-xl border border-surface-border bg-surface p-6 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <LockKey size={22} weight="duotone" />
        </span>
        <h2 className="text-base font-bold text-slate-800">
          {access === 'owner' ? 'Owner only' : 'You do not have access to this page'}
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          {access === 'owner'
            ? 'This screen belongs to the business owner.'
            : needed
              ? <>Ask the owner to tick <strong className="font-semibold text-slate-700">{needed}</strong> in Permissions &amp; Access.</>
              : 'Ask the owner to give your account access to it.'}
        </p>

        {/* A dead end is worse than a refusal. These come straight out of the
            access table filtered by what this person holds, so the suggestions
            cannot drift out of step with what will actually open. */}
        {elsewhere.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Pages you can open</p>
            <div className="flex flex-wrap justify-center gap-2">
              {elsewhere.map(page => (
                <Link
                  key={page.path}
                  to={page.path}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-green hover:text-brand-green"
                >
                  {page.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60vh] items-center justify-center p-6">{children}</div>
}

function Spinner() {
  return <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-green" />
}
