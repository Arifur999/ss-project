/**
 * What a team member may do WITHIN their role.
 *
 * The mirror of hatim_Backend/src/app/shared/permissions.ts. The two lists are
 * separate repos and have to be edited together: the backend drops any name it
 * does not recognise, so a permission added here alone is stored as nothing and
 * silently grants nothing. That is deliberate - it fails safe rather than
 * blocking a save - but it means a mismatch shows up as a checkbox that does
 * nothing, which is the exact problem this whole feature exists to fix.
 *
 * Two layers decide access, in this order:
 *
 *   1. Role       - the outer boundary. An owner-only screen stays owner-only
 *                   however these are set.
 *   2. Permission - narrows within a role. This is what lets an owner say "this
 *                   Manager, but not deletions".
 *
 * An empty list means "everything the role allows". Every existing team member
 * has an empty list, so nobody lost access when this shipped; restrictions begin
 * only once somebody ticks boxes for that user.
 *
 * Names dropped from the old matrix on purpose - Backup, Restore, Stock Book,
 * Purchase Book, Cart Edit, Quick Sale - because this app has no such feature. A
 * checkbox for something that does not exist is the same lie in a smaller form.
 */

export type PermissionGroup = {
  title: string
  items: string[]
}

/** Grouped for the Settings screen; the flat list below is what gets saved. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  { title: 'Purchase', items: ['View Purchase', 'Add Purchase', 'Edit Purchase', 'Delete Purchase', 'Receive Stock'] },
  { title: 'Sales', items: ['View Sales', 'New Sale', 'Edit Sale', 'Delete Sale', 'Discount'] },
  { title: 'Due Management', items: ['View Due', 'Add Due', 'Edit Due', 'Delete Due'] },
  { title: 'Expenses', items: ['View Expense', 'Add Expense', 'Edit Expense', 'Delete Expense'] },
  { title: 'Contacts - Customers', items: ['View Customer', 'Add Customer', 'Edit Customer', 'Delete Customer'] },
  { title: 'Contacts - Suppliers', items: ['View Supplier', 'Add Supplier', 'Edit Supplier', 'Delete Supplier'] },
  { title: 'Contacts - Employees', items: ['View Employee', 'Add Employee', 'Edit Employee', 'Delete Employee'] },
  { title: 'Inventory', items: ['Product List', 'Add Product', 'Edit Product', 'Delete Product', 'Stock Update', 'Stock History'] },
  { title: 'Money', items: ['View Balance', 'Account Transfer', 'View Shareholders', 'Profit Withdrawal', 'View Loans', 'Manage Loans'] },
  { title: 'Reports & System', items: ['View Reports', 'Business Settings', 'User Management', 'Marketing SMS', 'Recycle Bin'] },
]

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap(group => group.items)

/** What each role template starts with. "Custom" starts empty and is built by hand. */
export const PERMISSION_TEMPLATES: Record<string, string[]> = {
  owner: ALL_PERMISSIONS,
  manager: ALL_PERMISSIONS.filter(item => !item.startsWith('Delete') && !['User Management', 'Business Settings'].includes(item)),
  sales_staff: [
    'View Sales', 'New Sale', 'Discount',
    'View Customer', 'Add Customer', 'Edit Customer',
    'View Due', 'Add Due',
    'Product List',
  ],
  inventory_manager: [
    'Product List', 'Add Product', 'Edit Product', 'Delete Product', 'Stock Update', 'Stock History',
    'View Purchase', 'Add Purchase', 'Receive Stock',
    'View Supplier', 'Add Supplier', 'Edit Supplier',
  ],
  accountant: [
    'View Due', 'Add Due', 'Edit Due',
    'View Expense', 'Add Expense', 'Edit Expense',
    'View Balance', 'View Shareholders', 'View Loans',
    'View Reports',
  ],
  custom: [],
}

/**
 * Which permission a sidebar entry needs, keyed by its route.
 *
 * Only routes that map to a real permission appear here; anything absent is
 * always shown. The sidebar was never filtered at all, so a Sales Staff member
 * saw the whole app and found out what they could not do by clicking it and
 * getting a 403.
 */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  '/sales': 'New Sale',
  '/sales/ledger': 'View Sales',
  '/purchase': 'View Purchase',
  '/purchase/orders': 'Add Purchase',
  '/purchase/received': 'Receive Stock',
  '/purchase/ledger': 'View Purchase',
  '/purchase/history': 'View Purchase',
  '/products': 'Product List',
  '/products/list': 'Product List',
  '/inventory': 'Product List',
  '/customers': 'View Customer',
  '/customers/list': 'View Customer',
  '/customers/due': 'View Due',
  '/employees': 'View Employee',
  '/expenses': 'View Expense',
  '/balance': 'View Balance',
  '/transactions': 'View Shareholders',
  '/loan-management': 'View Loans',
  '/reports': 'View Reports',
  '/marketing': 'Marketing SMS',
  '/recycle-bin': 'Recycle Bin',
  '/settings': 'Business Settings',
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
