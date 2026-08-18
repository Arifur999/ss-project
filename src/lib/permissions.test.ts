import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_TEMPLATES, ROUTE_PERMISSIONS, hasPermission } from './permissions'

describe('hasPermission', () => {
  it('lets an owner do anything, whatever is stored', () => {
    // There would be no way back from locking an owner out of their own
    // workspace with a checkbox.
    expect(hasPermission('owner', [], 'Delete Sale')).toBe(true)
    expect(hasPermission('owner', ['View Sales'], 'Delete Sale')).toBe(true)
    expect(hasPermission('super_admin', [], 'Delete Sale')).toBe(true)
  })

  it('treats an empty list as full access for the role', () => {
    // Every team member had an empty column on the morning this shipped, so this
    // is what kept the upgrade from taking access away from anybody.
    expect(hasPermission('manager', [], 'Delete Sale')).toBe(true)
    expect(hasPermission('sales_staff', undefined, 'Delete Sale')).toBe(true)
  })

  it('restricts once boxes have actually been ticked', () => {
    expect(hasPermission('manager', ['View Sales'], 'Delete Sale')).toBe(false)
    expect(hasPermission('manager', ['View Sales', 'Delete Sale'], 'Delete Sale')).toBe(true)
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
  const allowedPath = (path?: string) => {
    const needed = path ? ROUTE_PERMISSIONS[path] : undefined
    return !needed || hasPermission(role, granted, needed)
  }
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
    const keys = filterNav(NAV, 'manager', ['View Sales']).map(g => g.key)
    expect(keys).not.toContain('inventory')
    expect(keys).toContain('dashboard') // '/' is not in ROUTE_PERMISSIONS, always shown
  })

  it('drops a group once every child is hidden, but keeps one with any child left', () => {
    const keys = filterNav(NAV, 'manager', ['View Sales']).map(g => g.key)
    expect(keys).toContain('sales')
    expect(keys).not.toContain('expenses')

    const sales = filterNav(NAV, 'manager', ['View Sales']).find(g => g.key === 'sales')
    expect(sales.children.map((c: any) => c.key)).toEqual(['ledger'])
  })
})

describe('the permission list itself', () => {
  it('has no duplicates', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length)
  })

  it('names nothing outside the groups shown in Settings', () => {
    const fromGroups = new Set(PERMISSION_GROUPS.flatMap(group => group.items))
    for (const name of ALL_PERMISSIONS) expect(fromGroups.has(name)).toBe(true)
  })

  it('every route permission is a real permission', () => {
    // A route asking for a name that is not in the list would hide that menu
    // entry from everyone who has any permissions at all.
    for (const needed of Object.values(ROUTE_PERMISSIONS)) {
      expect(ALL_PERMISSIONS).toContain(needed)
    }
  })

  it('every template grants only real permissions', () => {
    for (const [template, granted] of Object.entries(PERMISSION_TEMPLATES)) {
      for (const name of granted) {
        expect(ALL_PERMISSIONS, `${template} grants unknown "${name}"`).toContain(name)
      }
    }
  })

  it('names no feature that does not exist', () => {
    for (const gone of ['Backup', 'Restore', 'Stock Book', 'Purchase Book', 'Cart Edit', 'Quick Sale']) {
      expect(ALL_PERMISSIONS).not.toContain(gone)
    }
  })
})
