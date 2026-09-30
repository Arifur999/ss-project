import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, ROUTE_ACCESS, guardVerdict } from './permissions'

/**
 * The route guard's decision, which is the part worth pinning down.
 *
 * Two things have to be true at once: it refuses the right people, and it does
 * NOT refuse the right people when the server is merely unreachable. The second
 * is the one that is easy to get wrong and expensive when it is, so it gets its
 * own block at the bottom.
 */
const ask = (over: Partial<Parameters<typeof guardVerdict>[0]> = {}) => guardVerdict({
  loading: false,
  profileError: false,
  profile: { role: 'manager', permissions: [] },
  path: '/balance',
  ...over,
})

describe('who gets in', () => {
  it('lets an owner open anything, whatever is ticked', () => {
    for (const path of Object.keys(ROUTE_ACCESS)) {
      expect(ask({ profile: { role: 'owner', permissions: ['page:sales.new'] }, path })).toBe('allow')
    }
  })

  it('lets a super_admin open anything', () => {
    expect(ask({ profile: { role: 'super_admin', permissions: [] }, path: '/user-management' })).toBe('allow')
  })

  /**
   * The rule the whole upgrade rests on.
   *
   * Every existing team member has an empty array. If this stopped passing, the
   * deploy would lock a live workspace out of its own app the moment it landed.
   */
  it('lets anyone with nothing ticked open anything their role allows', () => {
    expect(ask({ profile: { role: 'manager', permissions: [] } })).toBe('allow')
    expect(ask({ profile: { role: 'sales_staff' } })).toBe('allow')
  })

  it('lets a restricted user open a page they hold', () => {
    expect(ask({ profile: { role: 'sales_staff', permissions: ['page:sales.new'] }, path: '/sales' })).toBe('allow')
  })

  it('lets every role open Support', () => {
    expect(ask({ profile: { role: 'sales_staff', permissions: ['page:sales.new'] }, path: '/support/tickets' })).toBe('allow')
  })
})

describe('who does not', () => {
  it('refuses a page the user does not hold', () => {
    expect(ask({ profile: { role: 'sales_staff', permissions: ['page:sales.new'] } })).toBe('deny')
  })

  // The headline bug: /user-management rendered the whole User Management screen,
  // both modals, interactive, to any signed-in staff member.
  it('refuses User Management to a staff member however much is ticked', () => {
    expect(ask({ profile: { role: 'manager', permissions: ALL_PERMISSIONS }, path: '/user-management' })).toBe('deny')
    expect(ask({ profile: { role: 'accountant', permissions: [] }, path: '/user-management' })).toBe('deny')
  })

  it('refuses the Recycle Bin to a staff member', () => {
    expect(ask({ profile: { role: 'manager', permissions: [] }, path: '/recycle-bin' })).toBe('deny')
  })

  // Default-deny. The inversion that makes the whole thing real: before this,
  // anything absent from the table was always shown.
  it('refuses a path it has never heard of', () => {
    expect(ask({ path: '/some/invented/screen' })).toBe('deny')
    expect(ask({ path: '/balance/secret' })).toBe('deny')
  })

  it('keeps everyone but a super_admin out of the platform console', () => {
    expect(ask({ profile: { role: 'owner', permissions: [] }, path: '/super-admin/owners' })).toBe('deny')
    expect(ask({ profile: { role: 'super_admin', permissions: [] }, path: '/super-admin/owners' })).toBe('allow')
  })
})

describe('when the server cannot be reached', () => {
  /**
   * The trap this whole verdict exists for.
   *
   * AuthContext calls setLoading(false) on a non-401 failure while retries are
   * still scheduled, so `loading === false` with `profile === null` means "we
   * could not ask", not "nobody". Answering 'deny' there would tell a legitimate
   * user their access had been taken away every time a deploy restarted the API,
   * and they would have no reason to doubt it.
   */
  it('says unreachable, never deny, when the profile could not be fetched', () => {
    expect(ask({ profile: null, profileError: true })).toBe('unreachable')
    expect(ask({ profile: undefined, profileError: true })).toBe('unreachable')
  })

  it('waits while the first load is still in flight', () => {
    expect(ask({ loading: true, profile: null })).toBe('wait')
    // A signed-out tab, briefly, before ProtectedRoute redirects to /login.
    expect(ask({ profile: null, profileError: false })).toBe('wait')
  })

  it('never returns deny without a profile to judge', () => {
    // Belt and braces on the ordering above: deny must always be a statement
    // about somebody, never about the absence of somebody.
    for (const profileError of [true, false]) {
      for (const loading of [true, false]) {
        expect(ask({ profile: null, profileError, loading })).not.toBe('deny')
      }
    }
  })

  it('decides on a profile even when it is only an unconfirmed hint', () => {
    // The hint lives in localStorage and the user can edit it, so it is not the
    // security boundary and does not need to be: the server reads permissions
    // from the database on every request. Blocking here would throw away the
    // instant repaint the hint exists for and buy nothing.
    expect(ask({ profile: { role: 'sales_staff', permissions: ['page:sales.new'] }, path: '/sales' })).toBe('allow')
    expect(ask({ profile: { role: 'sales_staff', permissions: ['page:sales.new'] }, path: '/balance' })).toBe('deny')
  })
})
