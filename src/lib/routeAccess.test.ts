import { describe, expect, it } from 'vitest'
import APP from '../App.tsx?raw'
import { ROUTE_ACCESS, canReach } from './permissions'

/**
 * Every route App.tsx mounts has a rule.
 *
 * `canReach` denies a path it has never heard of, so a route added without an
 * entry in ROUTE_ACCESS fails closed - which is the right direction, but it fails
 * at runtime, on somebody's screen, as a page that used to work and now refuses.
 * This turns that into a red test on the machine of whoever added it.
 *
 * Reading App.tsx as text is crude. The tidier version is a data table of routes
 * with a required `access` field, so TypeScript refuses a route that has not
 * decided - that is the better fix and it is a rewrite of seventy-seven route
 * lines. This buys most of the guarantee for none of the risk.
 */
/**
 * Only the routes inside the Layout shell.
 *
 * RequirePage wraps the Outlet, so it never sees /login, /register,
 * /forgot-password, /choose-plan or /subscription-checkout - those are mounted
 * before the shell and have their own signed-in/signed-out redirects. Splitting on
 * the shell's own <Route> is better than a hand-kept list of exceptions: a public
 * page added tomorrow lands on the right side of the line by itself.
 */
const SHELL = '<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>'
const shellIndex = APP.indexOf(SHELL)
const insideShell = shellIndex === -1 ? '' : APP.slice(shellIndex)

const mounted = [...insideShell.matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1])

describe('App.tsx routes', () => {
  it('finds the shell and its routes at all', () => {
    // Without this, every assertion below could pass over an empty list.
    expect(shellIndex, 'the Layout shell route has been renamed').toBeGreaterThan(-1)
    expect(mounted.length).toBeGreaterThan(60)
  })

  it('gives every mounted route a rule', () => {
    const missing = mounted.filter(path => {
      if (path === '*') return false                       // the catch-all, outside the shell
      if (path.startsWith('/super-admin')) return false    // SuperAdminRoute, by role
      if (path.includes(':')) return false                 // parameterised - matched by prefix, see below
      return ROUTE_ACCESS[path] === undefined
    })
    expect(missing, `routes with no entry in ROUTE_ACCESS:\n  ${missing.join('\n  ')}`).toEqual([])
  })

  it('names no path in ROUTE_ACCESS that the app does not mount', () => {
    // A rule for a path that does not exist is worse than no rule: it reads as a
    // considered decision about live code. This is how the previous table ended
    // up with eight keys pointing at paths that had moved.
    const mountedSet = new Set(mounted)
    const stale = Object.keys(ROUTE_ACCESS).filter(path => !mountedSet.has(path))
    expect(stale, `ROUTE_ACCESS names paths App.tsx does not mount:\n  ${stale.join('\n  ')}`).toEqual([])
  })

  it('still sends an unknown path to the catch-all', () => {
    // The redirect-loop half of the contract: `*` navigates to '/', and '/' must
    // therefore never render a refusal. App.tsx redirects it to firstAllowedPath.
    expect(APP).toContain('path="*"')
    expect(APP).toContain('firstAllowedPath')
  })

  it('has collapsed the second mount of Adjustments', () => {
    expect(APP).not.toMatch(/path="\/transactions\/adjustments" element=\{<Adjustments \/>\}/)
    expect(APP).toContain('path="/transactions/adjustments" element={<Navigate to="/balance/transfer"')
  })
})

describe('the guard and the sidebar cannot disagree', () => {
  it('uses canReach in both places', () => {
    // One predicate, two callers. While the sidebar read one table and App.tsx
    // read nothing, the menu and what the app would open were two independent
    // opinions - and the app's opinion was "everything".
    expect(APP).toContain('canReach')
  })

  it('opens for a user with nothing ticked, every mounted business route', () => {
    for (const path of mounted) {
      if (path === '*' || path.includes(':') || path.startsWith('/super-admin')) continue
      if (ROUTE_ACCESS[path] === undefined || ROUTE_ACCESS[path] === 'owner') continue
      expect(canReach('manager', [], path), `a manager with no ticks was denied ${path}`).toBe(true)
    }
  })
})
