import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  DELETE_PERMISSIONS,
  PAGE_PERMISSIONS,
  PERMISSION_FINGERPRINT,
  PERMISSION_GROUPS,
  PERMISSION_TEMPLATES,
  ROUTE_ACCESS,
  allowedPages,
  canReach,
  firstAllowedPath,
  groupIsOpen,
  groupOf,
  hasPermission,
  permissionLabel,
  pruneOrphanDeletes,
} from './permissions'

describe('hasPermission', () => {
  it('lets an owner do anything, whatever is stored', () => {
    // There would be no way back from locking an owner out of their own
    // workspace with a checkbox.
    expect(hasPermission('owner', [], 'act:sales.delete')).toBe(true)
    expect(hasPermission('owner', ['page:sales.ledger'], 'act:sales.delete')).toBe(true)
    expect(hasPermission('super_admin', [], 'act:sales.delete')).toBe(true)
  })

  it('treats an empty list as full access for the role', () => {
    // Every team member had an empty column on the morning this shipped, so this
    // is what kept the upgrade from taking access away from anybody.
    expect(hasPermission('manager', [], 'act:sales.delete')).toBe(true)
    expect(hasPermission('sales_staff', undefined, 'act:sales.delete')).toBe(true)
  })

  it('restricts once boxes have actually been ticked', () => {
    expect(hasPermission('manager', ['page:sales.ledger'], 'act:sales.delete')).toBe(false)
    expect(hasPermission('manager', ['page:sales.ledger', 'act:sales.delete'], 'act:sales.delete')).toBe(true)
  })
})

describe('canReach', () => {
  it('passes an owner and a super_admin everywhere', () => {
    for (const path of Object.keys(ROUTE_ACCESS)) {
      expect(canReach('owner', ['page:sales.new'], path), `owner denied ${path}`).toBe(true)
      expect(canReach('super_admin', [], path), `super_admin denied ${path}`).toBe(true)
    }
  })

  it('passes anyone whose list is empty - the upgrade hatch', () => {
    // The single most important test in this file. Every existing team member
    // has an empty array, and this is what stops the deploy locking them out.
    for (const path of Object.keys(ROUTE_ACCESS)) {
      if (ROUTE_ACCESS[path] === 'owner') continue
      expect(canReach('manager', [], path), `manager with no ticks denied ${path}`).toBe(true)
      expect(canReach('sales_staff', undefined, path), `undefined list denied ${path}`).toBe(true)
    }
  })

  it('restricts a staff member to the pages they hold', () => {
    const granted = ['page:sales.new', 'page:customers.list']
    expect(canReach('sales_staff', granted, '/sales')).toBe(true)
    expect(canReach('sales_staff', granted, '/customers')).toBe(true)
    expect(canReach('sales_staff', granted, '/balance')).toBe(false)
    expect(canReach('sales_staff', granted, '/sales/ledger')).toBe(false)
  })

  // The whole point of the rewrite. Before this, App.tsx never consulted a
  // permission at all and every business route rendered for anyone signed in.
  it('denies a path it has never heard of', () => {
    expect(canReach('manager', ['page:sales.new'], '/some/new/screen')).toBe(false)
    expect(canReach('manager', ['page:sales.new'], '/balance/secret')).toBe(false)
  })

  it('keeps the Admin and Package menus to the owner, ticks or no ticks', () => {
    // Checked BEFORE the empty-list hatch on purpose: "everything your role
    // allows" is not "everything", and a manager's role does not allow Admin.
    for (const path of ['/user-management', '/recycle-bin', '/settings', '/current-plan', '/package/billing-history']) {
      expect(canReach('manager', [], path), `manager reached ${path}`).toBe(false)
      expect(canReach('accountant', ALL_PERMISSIONS, path), `full ticks reached ${path}`).toBe(false)
      expect(canReach('owner', [], path), `owner denied ${path}`).toBe(true)
    }
  })

  it('lets everyone signed in reach Support', () => {
    // Support is what somebody reaches for when the rest of the menu has stopped
    // making sense, so it can never be the thing they lost access to.
    expect(canReach('sales_staff', ['page:sales.new'], '/support/tickets')).toBe(true)
    expect(canReach('accountant', ['page:expenses.overview'], '/support/guideline')).toBe(true)
  })

  it('keeps everyone but a super_admin out of /super-admin', () => {
    expect(canReach('super_admin', [], '/super-admin')).toBe(true)
    expect(canReach('super_admin', [], '/super-admin/owners')).toBe(true)
    expect(canReach('owner', [], '/super-admin')).toBe(false)
    expect(canReach('owner', [], '/super-admin/owners')).toBe(false)
    expect(canReach('manager', ALL_PERMISSIONS, '/super-admin/finance')).toBe(false)
  })
})

describe('firstAllowedPath', () => {
  it('sends somebody to their first page in menu order', () => {
    expect(firstAllowedPath('sales_staff', ['page:sales.new'])).toBe('/sales')
    expect(firstAllowedPath('accountant', ['page:reports.yearly', 'page:expenses.overview'])).toBe('/expenses')
  })

  it('lands on the Dashboard for an owner and for anyone with nothing ticked', () => {
    expect(firstAllowedPath('owner', [])).toBe('/')
    expect(firstAllowedPath('manager', [])).toBe('/')
  })

  // The redirect-loop guard. An owner can tick nothing but a delete, and the
  // landing page must still resolve to something that renders.
  it('always returns somewhere reachable, even for an impossible grant', () => {
    const path = firstAllowedPath('manager', ['act:sales.delete'])
    expect(canReach('manager', ['act:sales.delete'], path)).toBe(true)
    expect(path).toBe('/support/tickets')
  })
})

describe('the orphan delete rule', () => {
  it('drops a delete tick whose box has no page ticked', () => {
    // requirePermission is any-of, so it cannot express "page AND delete" -
    // act:sales.delete alone would grant API delete on a screen the user cannot
    // open. Removed in both repos rather than contorting the middleware.
    expect(pruneOrphanDeletes(['act:sales.delete'])).toEqual([])
    expect(pruneOrphanDeletes(['page:sales.new', 'act:sales.delete'])).toEqual(['page:sales.new', 'act:sales.delete'])
  })

  it('judges each box on its own pages', () => {
    expect(pruneOrphanDeletes(['page:sales.new', 'act:customers.delete'])).toEqual(['page:sales.new'])
  })

  it('leaves page permissions untouched', () => {
    expect(pruneOrphanDeletes([...PAGE_PERMISSIONS])).toEqual([...PAGE_PERMISSIONS])
  })

  it('reads the group out of either kind of name', () => {
    expect(groupOf('page:purchase.received')).toBe('purchase')
    expect(groupOf('act:purchase.delete')).toBe('purchase')
    expect(groupOf('page:customers.due-received')).toBe('customers')
  })

  it('tells the UI when a delete tick is allowed to be enabled', () => {
    const sales = PERMISSION_GROUPS.find(group => group.key === 'sales')!
    expect(groupIsOpen(sales, [])).toBe(false)
    expect(groupIsOpen(sales, ['page:customers.list'])).toBe(false)
    expect(groupIsOpen(sales, ['page:sales.history'])).toBe(true)
  })
})

/**
 * The sidebar filter, written the way Layout applies it.
 *
 * The first version mapped `children: group.children ?? []` over every entry,
 * which gave a top-level LINK an empty children array where it had had none -
 * and the "drop a group with nothing left in it" rule then removed it. Inventory
 * disappeared from the menu and the whole super-admin sidebar went blank. These
 * are the checks that would have caught it.
 */
function filterNav(nav: any[], role: string | undefined, granted: string[] | undefined) {
  const allowedPath = (path?: string) => canReach(role, granted, path)
  return nav
    .map(group => {
      if (!group.children) return group
      return { ...group, children: group.children.filter((child: any) => allowedPath(child.path)) }
    })
    .filter(group => (group.children ? group.children.length > 0 : allowedPath(group.path)))
}

const NAV = [
  { key: 'dashboard', path: '/' },
  { key: 'inventory', path: '/inventory' },
  { key: 'sales', children: [{ key: 'newSale', path: '/sales' }, { key: 'ledger', path: '/sales/ledger' }] },
  { key: 'expenses', children: [{ key: 'expOverview', path: '/expenses' }] },
]

describe('sidebar filtering', () => {
  it('keeps top-level links that have no children', () => {
    // The bug. /inventory is a direct link with no children, and it was being
    // dropped for every single user including the owner.
    const keys = filterNav(NAV, 'owner', []).map(g => g.key)
    expect(keys).toContain('inventory')
    expect(keys).toContain('dashboard')
  })

  it('leaves the whole menu alone for a user with nothing ticked', () => {
    expect(filterNav(NAV, 'manager', []).map(g => g.key)).toEqual(['dashboard', 'inventory', 'sales', 'expenses'])
    expect(filterNav(NAV, 'sales_staff', undefined).map(g => g.key)).toEqual(['dashboard', 'inventory', 'sales', 'expenses'])
  })

  it('does not give a childless entry an empty children array', () => {
    // What actually caused the disappearance: `children: []` is truthy, so the
    // group then failed the "has children left" test.
    const dashboard = filterNav(NAV, 'owner', []).find(g => g.key === 'dashboard')
    expect(dashboard.children).toBeUndefined()
  })

  it('hides a top-level link the user does not hold', () => {
    const keys = filterNav(NAV, 'manager', ['page:sales.ledger']).map(g => g.key)
    expect(keys).not.toContain('inventory')
    // '/' is a permission of its own now, so a restricted user genuinely loses
    // the Dashboard link - and App.tsx redirects them to their first page.
    expect(keys).not.toContain('dashboard')
    expect(filterNav(NAV, 'manager', ['page:sales.ledger', 'page:dashboard.overview']).map(g => g.key)).toContain('dashboard')
  })

  it('drops a group once every child is hidden, but keeps one with any child left', () => {
    const keys = filterNav(NAV, 'manager', ['page:sales.ledger']).map(g => g.key)
    expect(keys).toContain('sales')
    expect(keys).not.toContain('expenses')

    const sales = filterNav(NAV, 'manager', ['page:sales.ledger']).find(g => g.key === 'sales')
    expect(sales.children.map((c: any) => c.key)).toEqual(['ledger'])
  })
})

describe('the permission list itself', () => {
  it('has no duplicates', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length)
  })

  /**
   * The lockstep check.
   *
   * The same literal is asserted in hatim_Backend/src/app/shared/permissions.test.ts.
   * The two files live in separate repos with separate CI so nothing can compare
   * them at build time - this can. When it fails, look at the OTHER repo before
   * you edit the number.
   */
  it('hashes to the value the backend also asserts', () => {
    expect(PERMISSION_FINGERPRINT).toBe('59-2f1ec9b0')
    expect(PAGE_PERMISSIONS).toHaveLength(50)
    expect(DELETE_PERMISSIONS).toHaveLength(9)
  })

  it('names nothing outside the groups shown in Settings', () => {
    const fromGroups = new Set(PERMISSION_GROUPS.flatMap(group => [
      ...group.items.map(item => item.name),
      ...(group.deletePermission ? [group.deletePermission] : []),
    ]))
    for (const name of ALL_PERMISSIONS) expect(fromGroups.has(name)).toBe(true)
  })

  it('gives every group a key, a navKey, a title and at least one page', () => {
    const keys = new Set<string>()
    for (const group of PERMISSION_GROUPS) {
      expect(group.key, 'a group with no key').toBeTruthy()
      expect(group.navKey, `${group.key} has no navKey`).toBeTruthy()
      expect(group.title, `${group.key} has no title`).toBeTruthy()
      expect(group.items.length, `${group.key} has no pages`).toBeGreaterThan(0)
      expect(keys.has(group.key), `duplicate group key ${group.key}`).toBe(false)
      keys.add(group.key)
    }
  })

  it('names every permission after its own group', () => {
    // page:sales.ledger living in the customers box would make permissionLabel
    // lie and the orphan rule misfire.
    for (const group of PERMISSION_GROUPS) {
      for (const item of group.items) {
        expect(item.name.startsWith(`page:${group.key}.`), `${item.name} is not in ${group.key}`).toBe(true)
      }
      if (group.deletePermission) {
        expect(group.deletePermission).toBe(`act:${group.key}.delete`)
      }
    }
  })

  it('gives every delete tick a page to sit behind', () => {
    for (const name of DELETE_PERMISSIONS) {
      const siblings = PAGE_PERMISSIONS.filter(page => groupOf(page) === groupOf(name))
      expect(siblings.length, `${name} has no page in its group`).toBeGreaterThan(0)
    }
  })

  // A permission that opens no page is a checkbox that lies.
  it('gives every page permission a route that uses it', () => {
    const used = new Set(Object.values(ROUTE_ACCESS))
    for (const name of PAGE_PERMISSIONS) {
      expect(used.has(name), `${name} grants no route`).toBe(true)
    }
  })

  it('never guards a route with a delete permission', () => {
    // ROUTE_ACCESS answers "may open this screen". A delete tick is not an
    // answer to that question, and one here would make the page unreachable for
    // everyone who was only given the page.
    for (const [path, access] of Object.entries(ROUTE_ACCESS)) {
      expect(access.startsWith('act:'), `${path} is guarded by a delete tick`).toBe(false)
    }
  })

  it('every route asks for a real permission or a known sentinel', () => {
    for (const [path, access] of Object.entries(ROUTE_ACCESS)) {
      if (access === 'all' || access === 'owner') continue
      expect(PAGE_PERMISSIONS, `${path} asks for unknown "${access}"`).toContain(access)
    }
  })

  it('every template grants only real permissions', () => {
    for (const [template, granted] of Object.entries(PERMISSION_TEMPLATES)) {
      for (const name of granted) {
        expect(ALL_PERMISSIONS, `${template} grants unknown "${name}"`).toContain(name)
      }
    }
  })

  it('never hands out a template that the orphan rule would trim', () => {
    for (const [template, granted] of Object.entries(PERMISSION_TEMPLATES)) {
      expect(pruneOrphanDeletes([...granted]), `${template} carries an orphan delete`).toEqual([...granted])
    }
  })

  it('gives the manager template every page and no deletes', () => {
    expect(PERMISSION_TEMPLATES.manager).toEqual([...PAGE_PERMISSIONS])
    expect(PERMISSION_TEMPLATES.manager.some(name => name.startsWith('act:'))).toBe(false)
  })

  it('names no feature that does not exist', () => {
    for (const gone of ['Backup', 'Restore', 'Stock Book', 'Purchase Book', 'Cart Edit', 'Quick Sale']) {
      expect(ALL_PERMISSIONS).not.toContain(gone)
    }
  })

  it('has dropped the old action-shaped vocabulary entirely', () => {
    // Four of these were enforced nowhere at all, and the rest cannot be
    // stored any more. If one reappears here, the migration has been undone.
    for (const gone of ['View Sales', 'Delete Purchase', 'Discount', 'Business Settings', 'User Management', 'Marketing SMS', 'Recycle Bin']) {
      expect(ALL_PERMISSIONS).not.toContain(gone)
    }
  })
})

describe('ROUTE_ACCESS', () => {
  it('covers the two pages that are mounted twice, with different rules', () => {
    // /sales and /sales/ledger render the same component, which is how the
    // sidebar presents them. Collapsing them into one rule would silently give
    // anyone who can take an order the whole sales ledger.
    expect(ROUTE_ACCESS['/sales']).toBe('page:sales.new')
    expect(ROUTE_ACCESS['/sales/ledger']).toBe('page:sales.ledger')
    expect(ROUTE_ACCESS['/sales']).not.toBe(ROUTE_ACCESS['/sales/ledger'])
  })

  it('gives every redirect its destination rule', () => {
    // A redirect with no rule of its own would let somebody bounce through it
    // into a page they do not hold.
    expect(ROUTE_ACCESS['/damage']).toBe(ROUTE_ACCESS['/damage/dashboard'])
    expect(ROUTE_ACCESS['/loan-management']).toBe(ROUTE_ACCESS['/loan-management/dashboard'])
    expect(ROUTE_ACCESS['/transactions/loans']).toBe(ROUTE_ACCESS['/loan-management/transactions'])
    // The old second mount of Adjustments, now a redirect to the sidebar's path.
    expect(ROUTE_ACCESS['/transactions/adjustments']).toBe(ROUTE_ACCESS['/balance/transfer'])
    expect(ROUTE_ACCESS['/package/sms']).toBe(ROUTE_ACCESS['/marketing/buy-sms'])
    expect(ROUTE_ACCESS['/settings']).toBe('owner')
  })

  it('has a rule for the report page kept out of the menu', () => {
    expect(ROUTE_ACCESS['/reports/monthly']).toBe('page:reports.summary')
  })
})

describe('permissionLabel', () => {
  it('names a page the way the Permissions screen does', () => {
    expect(permissionLabel('page:sales.ledger')).toBe('Sales - Sales Ledger')
    expect(permissionLabel('page:purchase.received')).toBe('Purchase - Product Received')
  })

  it('uses the box title alone where the box holds one page', () => {
    expect(permissionLabel('page:dashboard.overview')).toBe('Dashboard')
    expect(permissionLabel('page:inventory.stock')).toBe('Inventory')
  })

  it('names a delete tick', () => {
    expect(permissionLabel('act:sales.delete')).toBe('Sales - delete')
  })

  it('hands back anything it does not recognise, rather than blanking it', () => {
    expect(permissionLabel('page:nope.gone')).toBe('page:nope.gone')
  })
})

describe('allowedPages', () => {
  it('offers the no-access panel somewhere to go', () => {
    const pages = allowedPages('sales_staff', ['page:sales.new', 'page:customers.list'])
    expect(pages.map(page => page.path)).toEqual(['/sales', '/customers'])
    expect(pages[0].label).toBe('Sales - New Sales Entry')
  })

  it('never suggests an owner-only or always-on page', () => {
    for (const page of allowedPages('manager', [])) {
      expect(ROUTE_ACCESS[page.path]).not.toBe('owner')
      expect(ROUTE_ACCESS[page.path]).not.toBe('all')
    }
  })
})
