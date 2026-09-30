/**
 * What a team member may reach, and the one thing they may destroy.
 *
 * The mirror of hatim_Backend/src/app/shared/permissions.ts. The two lists are
 * separate repos and have to be edited together: the backend drops any name it
 * does not recognise, so a permission added here alone is stored as nothing and
 * silently grants nothing. PERMISSION_FINGERPRINT below turns a mismatch into a
 * failing test in both repos instead of a checkbox that does nothing.
 *
 * ---------------------------------------------------------------------------
 * Why this is shaped like the sidebar
 * ---------------------------------------------------------------------------
 * The first version of this file was shaped like a permission system: eleven
 * boxes of View / Add / Edit / Delete across invented areas ("Due Management",
 * "Contacts - Customers", "Reports & System"). Nothing in the app is laid out
 * that way, so an owner ticking boxes had to translate from the menu they know
 * into a vocabulary they had never seen, and the result did not match either -
 * "View Due" covered two pages, "Reports & System" covered five, and four names
 * (Discount, Business Settings, User Management, Marketing SMS) were enforced
 * nowhere at all.
 *
 * So the vocabulary is now the menu: one box per top-level sidebar group, one
 * checkbox per sub-page inside it, with the labels the sidebar itself shows.
 * "Can this person open this screen" is the question an owner is actually
 * asking, and now it is the question the screen asks back.
 *
 * ---------------------------------------------------------------------------
 * Two kinds of name, and why there is a prefix
 * ---------------------------------------------------------------------------
 *   page:<group>.<leaf>   - may open this screen
 *   act:<group>.delete    - may delete records in this group
 *
 * The prefix earns its keep three times over: the modal splits the two kinds
 * out of the data alone (pages become the checkbox grid, the act: name becomes
 * one tick under a divider), ROUTE_ACCESS can be typed to accept only page:
 * names so a route can never be guarded by a delete permission, and
 * `'act:sales.delete' = ANY(permissions)` answers "who can delete a sale" in
 * one query against the live database.
 *
 * Deliberately NOT the route path (`page:/purchase/product-received`). Paths
 * drift, and the previous version of this file proves it: eight of its
 * twenty-seven route keys pointed at paths that no longer existed, so those
 * entries silently did nothing. A URL in a stored permission couples
 * authorization to routing, and `/sales` and `/sales/ledger` render the same
 * component under two different permissions anyway.
 *
 * Every group uses `<group>.<leaf>` even where it has one page, so there is one
 * parse rule and no special case the day Inventory grows a second screen.
 *
 * ---------------------------------------------------------------------------
 * The rule for an empty list
 * ---------------------------------------------------------------------------
 * A user with NO permissions stored gets everything their role allows. That is
 * what makes this deployable to a live system, and it is load-bearing in three
 * places - hasPermission here, requirePermission on the server, and RequirePage
 * on every route. Do not "tidy" it away.
 *
 * An owner and a super_admin always bypass. Locking an owner out of their own
 * workspace with a checkbox is never the intent and there would be no way back.
 *
 * ---------------------------------------------------------------------------
 * Names that do not appear, on purpose
 * ---------------------------------------------------------------------------
 * There is no tick for Admin - the whole menu, User Management and Recycle Bin
 * alike, is owner-only by role, so there is no way to grant it and no box
 * pretending otherwise. There is no tick for Support (every role has it) or
 * Package (already owner-only). And a delete tick exists only where a non-owner
 * can actually reach a delete endpoint: Balance, Shareholders, Loans and
 * Expenses delete under `checkAuth(Role.owner)` and Inventory has no delete at
 * all, so a tick there could never change an outcome. A checkbox for something
 * that does not exist is the same lie in a smaller form.
 */

export type PermissionItem = {
  /** The stored name. */
  name: string
  /** What the sidebar calls this page, so the two screens read alike. */
  label: string
}

export type PermissionGroup = {
  /** Stable key for icons and tests; never shown, never translated. */
  key: string
  /** The sidebar group this box mirrors - asserted against Layout by test. */
  navKey: string
  /** Display copy. Safe to translate. */
  title: string
  items: PermissionItem[]
  /** The one extra tick, on the 9 groups where deleting is reachable. */
  deletePermission?: string
}

/**
 * The Permissions screen, box by box, in sidebar order.
 *
 * Order matters twice: the boxes appear in this order, and firstAllowedPath
 * walks it to decide where a restricted user lands after signing in.
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'dashboard', navKey: 'dashboard', title: 'Dashboard',
    items: [
      { name: 'page:dashboard.overview', label: 'Dashboard' },
    ],
  },
  {
    key: 'balance', navKey: 'balance', title: 'Balance',
    items: [
      { name: 'page:balance.overview', label: 'Overview' },
      { name: 'page:balance.transfer', label: 'Balance Transfer' },
      { name: 'page:balance.ledger', label: 'Ledger' },
      { name: 'page:balance.wallet', label: 'Wallet' },
    ],
  },
  {
    key: 'shareholders', navKey: 'transactions', title: 'Shareholders',
    items: [
      { name: 'page:shareholders.dashboard', label: 'Dashboard' },
      { name: 'page:shareholders.invest', label: 'Invest / Withdraw' },
      { name: 'page:shareholders.profit', label: 'Profit Withdraw' },
      { name: 'page:shareholders.list', label: 'Shareholders List' },
    ],
  },
  {
    key: 'loans', navKey: 'loanManagement', title: 'Loan Management',
    items: [
      { name: 'page:loans.dashboard', label: 'Dashboard' },
      { name: 'page:loans.lenders', label: 'Bank / Person List' },
      { name: 'page:loans.transactions', label: 'Transaction' },
      { name: 'page:loans.ledger', label: 'Ledger' },
    ],
  },
  {
    key: 'expenses', navKey: 'expenses', title: 'Expenses',
    items: [
      { name: 'page:expenses.overview', label: 'Overview' },
      { name: 'page:expenses.transactions', label: 'Transactions' },
    ],
  },
  {
    key: 'products', navKey: 'productList', title: 'Product List',
    items: [
      { name: 'page:products.list', label: 'Product List' },
      { name: 'page:products.update-price', label: 'Update Price' },
    ],
    deletePermission: 'act:products.delete',
  },
  {
    key: 'supplier', navKey: 'supplier', title: 'Supplier',
    items: [
      { name: 'page:supplier.dashboard', label: 'Dashboard' },
      { name: 'page:supplier.report', label: 'Report' },
      { name: 'page:supplier.payments', label: 'Transaction' },
      { name: 'page:supplier.other-income', label: 'Others Income' },
      { name: 'page:supplier.list', label: 'Suppliers List' },
    ],
    deletePermission: 'act:supplier.delete',
  },
  {
    key: 'purchase', navKey: 'purchase', title: 'Purchase',
    items: [
      { name: 'page:purchase.orders', label: 'Purchase' },
      { name: 'page:purchase.drafts', label: 'Draft Purchase' },
      { name: 'page:purchase.ledger', label: 'Invoice Ledger' },
      { name: 'page:purchase.received', label: 'Product Received' },
      { name: 'page:purchase.history', label: 'Product History' },
    ],
    deletePermission: 'act:purchase.delete',
  },
  {
    key: 'inventory', navKey: 'inventory', title: 'Inventory',
    items: [
      { name: 'page:inventory.stock', label: 'Inventory' },
    ],
  },
  {
    key: 'damage', navKey: 'damage', title: 'Damage',
    items: [
      { name: 'page:damage.dashboard', label: 'Dashboard' },
      { name: 'page:damage.entries', label: 'Repair / Return / Change' },
      { name: 'page:damage.receive', label: 'Receive' },
      { name: 'page:damage.transactions', label: 'Transactions' },
    ],
    deletePermission: 'act:damage.delete',
  },
  {
    key: 'sales', navKey: 'sales', title: 'Sales',
    items: [
      { name: 'page:sales.new', label: 'New Sales Entry' },
      { name: 'page:sales.drafts', label: 'Draft Sales' },
      { name: 'page:sales.ledger', label: 'Sales Ledger' },
      { name: 'page:sales.history', label: 'Sales History' },
    ],
    deletePermission: 'act:sales.delete',
  },
  {
    key: 'customers', navKey: 'customers', title: 'Customers',
    items: [
      { name: 'page:customers.dashboard', label: 'Dashboard' },
      { name: 'page:customers.list', label: 'Customer List' },
      { name: 'page:customers.due-received', label: 'Due Received' },
      { name: 'page:customers.ledger', label: 'Ledger' },
    ],
    deletePermission: 'act:customers.delete',
  },
  {
    key: 'reports', navKey: 'reports', title: 'Target & Report',
    items: [
      { name: 'page:reports.summary', label: 'Monthly Report' },
      { name: 'page:reports.yearly', label: 'Yearly Report' },
      { name: 'page:reports.monthly-target', label: 'Sales Target' },
      { name: 'page:reports.purchase-target', label: 'Purchase Target' },
    ],
    deletePermission: 'act:reports.delete',
  },
  {
    key: 'marketing', navKey: 'marketing', title: 'Marketing',
    items: [
      { name: 'page:marketing.campaign', label: 'Campaign' },
      { name: 'page:marketing.buy-sms', label: 'Buy SMS' },
    ],
    deletePermission: 'act:marketing.delete',
  },
  {
    key: 'employees', navKey: 'employees', title: 'Employees',
    items: [
      { name: 'page:employees.dashboard', label: 'Dashboard' },
      { name: 'page:employees.list', label: 'Employee List' },
      { name: 'page:employees.transactions', label: 'Salary / Bonus' },
      { name: 'page:employees.attendance', label: 'Attendance' },
    ],
    deletePermission: 'act:employees.delete',
  },
]

/** Every page permission, in sidebar order. */
export const PAGE_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap(group => group.items.map(item => item.name))

/** The nine delete ticks. */
export const DELETE_PERMISSIONS: string[] = PERMISSION_GROUPS
  .map(group => group.deletePermission)
  .filter((name): name is string => Boolean(name))

/** Everything that can be stored. Pages first, so Select All reads in menu order. */
export const ALL_PERMISSIONS: string[] = [...PAGE_PERMISSIONS, ...DELETE_PERMISSIONS]

/**
 * A digest of a permission vocabulary: how many names, and a hash of them.
 *
 * FNV-1a rather than sha256 because this has to run identically in a browser
 * bundle, in Vitest and in the backend's node:test - and `crypto.subtle` is
 * async while `node:crypto` is not in the bundle at all. Collisions do not
 * matter here; this is a change detector, not a signature.
 */
export function fingerprintPermissions(names: readonly string[]): string {
  const joined = [...names].sort().join('\n')
  let hash = 0x811c9dc5
  for (let index = 0; index < joined.length; index += 1) {
    hash ^= joined.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${names.length}-${hash.toString(16).padStart(8, '0')}`
}

/**
 * What the vocabulary hashes to right now, asserted against the same literal in
 * hatim_Backend's permissions.test.ts.
 *
 * The two files live in separate repos with separate CI, so nothing compares
 * them at build time. This does: change the list in one repo and that repo's
 * test goes red until the constant is bumped, and bumping it without doing the
 * same on the other side turns the other repo's suite red the first time it
 * runs. A silent mismatch becomes a failing test, which is the whole ask - the
 * previous version of this file could drift for a release before anybody
 * noticed a checkbox that did nothing.
 *
 * When this test fails, check the OTHER repo before editing the number.
 */
export const PERMISSION_FINGERPRINT = fingerprintPermissions(ALL_PERMISSIONS)

/** Human-readable name for a stored permission, for the no-access panel. */
export function permissionLabel(name: string): string {
  for (const group of PERMISSION_GROUPS) {
    if (group.deletePermission === name) return `${group.title} - delete`
    const item = group.items.find(entry => entry.name === name)
    if (item) return group.items.length === 1 ? group.title : `${group.title} - ${item.label}`
  }
  return name
}

/**
 * What each role template starts with. "Custom" starts empty and is built by hand.
 *
 * `manager` is every page and no deletes, which used to need a string test on
 * "Delete" and is now the prefix doing its job.
 */
export const PERMISSION_TEMPLATES: Record<string, string[]> = {
  owner: ALL_PERMISSIONS,
  manager: PAGE_PERMISSIONS,
  sales_staff: [
    'page:dashboard.overview',
    'page:sales.new', 'page:sales.drafts', 'page:sales.ledger', 'page:sales.history',
    'page:customers.dashboard', 'page:customers.list', 'page:customers.due-received', 'page:customers.ledger',
    'page:products.list',
    'page:inventory.stock',
  ],
  inventory_manager: [
    'page:dashboard.overview',
    'page:products.list', 'page:products.update-price',
    'page:inventory.stock',
    'page:purchase.orders', 'page:purchase.drafts', 'page:purchase.ledger', 'page:purchase.received', 'page:purchase.history',
    'page:damage.dashboard', 'page:damage.entries', 'page:damage.receive', 'page:damage.transactions',
    'page:supplier.dashboard', 'page:supplier.report', 'page:supplier.list',
    'act:products.delete',
  ],
  accountant: [
    'page:dashboard.overview',
    'page:expenses.overview', 'page:expenses.transactions',
    'page:balance.overview', 'page:balance.transfer', 'page:balance.ledger', 'page:balance.wallet',
    'page:shareholders.dashboard', 'page:shareholders.invest', 'page:shareholders.profit', 'page:shareholders.list',
    'page:loans.dashboard', 'page:loans.lenders', 'page:loans.transactions', 'page:loans.ledger',
    'page:customers.due-received', 'page:customers.ledger',
    'page:reports.summary', 'page:reports.yearly', 'page:reports.monthly-target', 'page:reports.purchase-target',
  ],
  custom: [],
}

/**
 * What a route needs: a page permission, or one of two sentinels.
 *
 *   'all'   - any signed-in member. Support, which is what somebody reaches for
 *             when the rest of the menu has stopped making sense, so it can
 *             never be the thing they lost access to.
 *   'owner' - the role, not a tick. The Admin and Package menus.
 */
export type Access = string

/**
 * Every route in the app, and what it takes to reach it.
 *
 * **Absent means denied.** That inversion is the point of this table. The
 * version before it was consulted by the sidebar alone and treated anything
 * missing as public, which is how all sixty-three business routes came to be
 * reachable by typing the URL - App.tsx has never imported this file.
 *
 * App.tsx keeps its routes in a table with a required `access` field, so a new
 * screen cannot be added without deciding this; forgetting is a compile error
 * rather than a hole.
 *
 * The redirect-only paths carry their destination's rule, so a denial happens
 * before the hop rather than after it, and the two pages mounted at two paths
 * (`/sales` and `/sales/ledger`) keep two different rules, because that is how
 * the sidebar presents them.
 */
export const ROUTE_ACCESS: Record<string, Access> = {
  '/': 'page:dashboard.overview',

  '/balance': 'page:balance.overview',
  '/balance/transfer': 'page:balance.transfer',
  '/balance/ledger': 'page:balance.ledger',
  '/balance/wallet': 'page:balance.wallet',

  '/transactions/dashboard': 'page:shareholders.dashboard',
  '/transactions/invest': 'page:shareholders.invest',
  '/transactions/profit': 'page:shareholders.profit',
  '/transactions/shareholders': 'page:shareholders.list',
  // Redirects and second mounts with no menu entry of their own.
  '/transactions/loans': 'page:loans.transactions',
  // The old second mount of the Adjustments screen, now a redirect to the path
  // the sidebar offers. It carries its destination's rule so a refusal happens
  // before the hop rather than after it.
  '/transactions/adjustments': 'page:balance.transfer',

  '/loan-management': 'page:loans.dashboard',
  '/loan-management/dashboard': 'page:loans.dashboard',
  '/loan-management/lenders': 'page:loans.lenders',
  '/loan-management/transactions': 'page:loans.transactions',
  '/loan-management/ledger': 'page:loans.ledger',

  '/expenses': 'page:expenses.overview',
  '/expenses/transactions': 'page:expenses.transactions',

  '/products': 'page:products.list',
  '/products/update-price': 'page:products.update-price',

  '/purchase/suppliers': 'page:supplier.dashboard',
  '/purchase/supplier-report': 'page:supplier.report',
  '/purchase/payments': 'page:supplier.payments',
  '/purchase/other-income': 'page:supplier.other-income',
  '/purchase/suppliers-list': 'page:supplier.list',

  '/purchase/orders': 'page:purchase.orders',
  '/purchase/drafts': 'page:purchase.drafts',
  '/purchase/ledger': 'page:purchase.ledger',
  '/purchase/product-received': 'page:purchase.received',
  '/purchase/history': 'page:purchase.history',

  '/inventory': 'page:inventory.stock',

  '/damage': 'page:damage.dashboard',
  '/damage/dashboard': 'page:damage.dashboard',
  '/damage/entries': 'page:damage.entries',
  '/damage/receive': 'page:damage.receive',
  '/damage/transactions': 'page:damage.transactions',

  '/sales': 'page:sales.new',
  '/sales/drafts': 'page:sales.drafts',
  '/sales/ledger': 'page:sales.ledger',
  '/sales/history': 'page:sales.history',

  '/customers/dashboard': 'page:customers.dashboard',
  '/customers': 'page:customers.list',
  '/customers/due-received': 'page:customers.due-received',
  '/customers/ledger': 'page:customers.ledger',

  '/reports': 'page:reports.summary',
  '/reports/yearly': 'page:reports.yearly',
  '/reports/monthly-target': 'page:reports.monthly-target',
  '/reports/purchase-target': 'page:reports.purchase-target',
  // A real page kept out of the menu on purpose - the older monthly report.
  // Mapped to the report that replaced it rather than given a checkbox for a
  // screen nobody can navigate to.
  '/reports/monthly': 'page:reports.summary',

  '/marketing': 'page:marketing.campaign',
  '/marketing/buy-sms': 'page:marketing.buy-sms',
  '/package/sms': 'page:marketing.buy-sms',

  '/employees': 'page:employees.dashboard',
  '/employees/list': 'page:employees.list',
  '/employees/transactions': 'page:employees.transactions',
  '/employees/attendance': 'page:employees.attendance',

  // Every role, always. See the 'all' note above.
  '/support/tickets': 'all',
  '/support/guideline': 'all',

  // The role decides, not a tick.
  '/user-management': 'owner',
  '/settings': 'owner',
  '/recycle-bin': 'owner',
  '/current-plan': 'owner',
  '/package/billing-history': 'owner',
}

/**
 * Whether a user holding `granted` may do `permission`.
 *
 * Mirrors requirePermission on the server, including both escape hatches: an
 * owner always may, and an empty list means "everything the role allows". This
 * only decides what to SHOW - the server decides what is allowed.
 */
export function hasPermission(role: string | undefined, granted: string[] | undefined, permission: string): boolean {
  if (role === 'owner' || role === 'super_admin') return true
  const list = granted ?? []
  if (list.length === 0) return true
  return list.includes(permission)
}

/**
 * Whether this user may reach this path.
 *
 * The single predicate behind both the sidebar filter and the route guard, so
 * the menu cannot offer a link that the guard then refuses - which is exactly
 * what happened while the sidebar read one table and App.tsx read nothing.
 *
 * Order is deliberate and matches requirePermission on the server:
 *
 *   1. super_admin passes everything, and is the only one inside /super-admin.
 *   2. owner passes everything.
 *   3. 'all' passes for anyone signed in.
 *   4. 'owner' fails for everyone else - checked BEFORE the empty-list hatch,
 *      because "everything your role allows" is not the same as "everything",
 *      and a manager's role does not allow Admin.
 *   5. An empty list passes. The upgrade hatch.
 *   6. Otherwise the name has to be held.
 *
 * An unknown path is denied. Default-deny is the whole reason this exists.
 */
export function canReach(
  role: string | undefined,
  granted: string[] | undefined,
  path: string | undefined
): boolean {
  if (!path) return true
  if (role === 'super_admin') return true
  if (path === '/super-admin' || path.startsWith('/super-admin/')) return false
  if (role === 'owner') return true

  const access = ROUTE_ACCESS[path]
  if (access === undefined) return false
  if (access === 'all') return true
  if (access === 'owner') return false

  const list = granted ?? []
  if (list.length === 0) return true
  return list.includes(access)
}

/**
 * Where to send somebody who cannot open the Dashboard.
 *
 * Walks ROUTE_ACCESS in declaration order - which is sidebar order - and
 * returns the first page they hold. The fallback is Support, which is 'all' and
 * therefore always reachable, so this can never return nothing and the app can
 * never land a signed-in user on a refusal with nowhere to go.
 */
export function firstAllowedPath(role: string | undefined, granted: string[] | undefined): string {
  for (const path of Object.keys(ROUTE_ACCESS)) {
    if (ROUTE_ACCESS[path] === 'owner') continue
    if (canReach(role, granted, path)) return path
  }
  return '/support/tickets'
}

/** The pages this user can actually open, for the no-access panel's suggestions. */
export function allowedPages(
  role: string | undefined,
  granted: string[] | undefined,
  limit = 6
): { path: string; label: string }[] {
  const out: { path: string; label: string }[] = []
  for (const path of Object.keys(ROUTE_ACCESS)) {
    if (out.length >= limit) break
    const access = ROUTE_ACCESS[path]
    if (access === 'owner' || access === 'all') continue
    if (!canReach(role, granted, path)) continue
    out.push({ path, label: permissionLabel(access) })
  }
  return out
}

/** Which group a `page:x.y` or `act:x.delete` name belongs to. */
export function groupOf(name: string): string {
  const dot = name.lastIndexOf('.')
  const colon = name.indexOf(':')
  return dot > colon ? name.slice(colon + 1, dot) : ''
}

/**
 * Drop a delete tick whose box has no page ticked.
 *
 * The same rule sanitizePermissions enforces on the server, applied here so the
 * screen never shows a state the server would not store. It exists because
 * requirePermission is any-of and therefore cannot express "page AND delete":
 * `act:sales.delete` held alone would grant delete on the API for a screen the
 * user cannot open. Rather than contort the middleware, the tick is meaningless
 * without a page and is removed in both places.
 */
export function pruneOrphanDeletes(names: string[]): string[] {
  const groups = new Set(names.filter(name => name.startsWith('page:')).map(groupOf))
  return names.filter(name => !name.startsWith('act:') || groups.has(groupOf(name)))
}

/** Whether this box has at least one page ticked, so its delete tick means something. */
export function groupIsOpen(group: PermissionGroup, granted: string[]): boolean {
  return group.items.some(item => granted.includes(item.name))
}

/** What the route guard should render. */
export type GuardVerdict =
  /** Still asking who this is. Show a spinner, decide nothing. */
  | 'wait'
  /** Could not ask. Say so - never refuse on this. */
  | 'unreachable'
  | 'allow'
  | 'deny'

/**
 * What the route guard should do, as a decision rather than a render.
 *
 * Pulled out of RequirePage so the interesting part can be tested without a DOM.
 * This project has no component-testing setup - all of its tests are pure - and
 * the branch that matters here is not the markup, it is the order of the four
 * cases below.
 *
 * `unreachable` is the one that earns its keep. AuthContext calls setLoading(false)
 * on a non-401 failure while retries are still scheduled, so `!loading` does not
 * mean "we know who this is". Deciding `deny` in that state would tell a
 * legitimate user their access had been taken away, every time a deploy restarted
 * the API - and they would have no reason to doubt it.
 */
export function guardVerdict(input: {
  loading: boolean
  profile: { role?: string; permissions?: string[] } | null | undefined
  profileError: boolean
  path: string
}): GuardVerdict {
  if (input.loading) return 'wait'
  // Order matters: unreachable before deny, always.
  if (!input.profile) return input.profileError ? 'unreachable' : 'wait'
  return canReach(input.profile.role, input.profile.permissions, input.path) ? 'allow' : 'deny'
}
