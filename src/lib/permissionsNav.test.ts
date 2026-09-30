import { describe, expect, it } from 'vitest'
// Vite's ?raw import rather than node:fs - this project has no @types/node, and
// `tsc --noEmit` is a CI gate, so reaching for the filesystem here would fail the
// build even though Vitest itself would run it.
import LAYOUT from '../components/Layout.tsx?raw'
import { PERMISSION_GROUPS, ROUTE_ACCESS } from './permissions'

/**
 * Does the Permissions screen still look like the sidebar?
 *
 * The whole vocabulary rests on a claim about another file: that every box
 * mirrors a real top-level menu and every tick a real sub-page. Nothing in the
 * type system holds that - somebody renames a sidebar group or moves a page and
 * the Permissions screen keeps offering the old shape, which is how the previous
 * version ended up with eight route keys pointing at paths that no longer
 * existed.
 *
 * So this reads Layout.tsx off the disk and checks the claim. Parsing a source
 * file in a test is ugly, and it is still cheaper than the class of bug it
 * catches: the alternative is a checkbox that silently grants nothing.
 */
/**
 * Top-level group keys as Layout declares them, ignoring the super-admin sidebar.
 *
 * Keyed off the icon size, which is the only thing separating a group from one of
 * its children in that file: groups and standalone links render at 18, sub-pages
 * at 16. Matching on `key: '...', label:` alone pulls in every child as well.
 */
const layoutGroupKeys = new Set(
  [...LAYOUT.matchAll(/key: '([a-zA-Z]+)', label:[^\n]*size=\{18\}/g)]
    .map(match => match[1])
    .filter(key => !key.startsWith('superAdmin'))
)

/** Every path the sidebar links to. */
const layoutPaths = new Set(
  [...LAYOUT.matchAll(/path: '([^']+)'/g)]
    .map(match => match[1])
    .filter(path => !path.startsWith('/super-admin'))
)

describe('the boxes mirror the sidebar', () => {
  it('names a real sidebar group in every navKey', () => {
    for (const group of PERMISSION_GROUPS) {
      expect(layoutGroupKeys.has(group.navKey), `${group.key} points at a sidebar group "${group.navKey}" that Layout does not declare`).toBe(true)
    }
  })

  it('gives every sidebar group a box, except the three that cannot have one', () => {
    // package is owner-only already, support is every role by design, and admin
    // is owner-only by decision - a tick for any of them would be a lie.
    const noBox = new Set(['package', 'support', 'admin'])
    const covered = new Set(PERMISSION_GROUPS.map(group => group.navKey))
    for (const key of layoutGroupKeys) {
      if (noBox.has(key)) continue
      expect(covered.has(key), `sidebar group "${key}" has no box in the Permissions screen`).toBe(true)
    }
  })

  it('has no box for a group the owner cannot grant', () => {
    for (const group of PERMISSION_GROUPS) {
      expect(['package', 'support', 'admin']).not.toContain(group.navKey)
    }
  })
})

describe('the sidebar and the access table agree', () => {
  it('gives every sidebar link a rule', () => {
    // A link with no rule is denied by canReach, so it would vanish from the
    // menu for everyone who has any tick at all.
    for (const path of layoutPaths) {
      expect(ROUTE_ACCESS[path], `sidebar links to ${path} with no entry in ROUTE_ACCESS`).toBeDefined()
    }
  })

  it('points every page tick at a path the sidebar actually offers', () => {
    // The eight dead keys in the old table were all this: a permission naming
    // /purchase/received while the sidebar had moved to /purchase/product-received.
    const ticks = PERMISSION_GROUPS.flatMap(group => group.items.map(item => item.name))
    for (const tick of ticks) {
      const paths = Object.keys(ROUTE_ACCESS).filter(path => ROUTE_ACCESS[path] === tick)
      const inSidebar = paths.some(path => layoutPaths.has(path))
      expect(inSidebar, `${tick} opens ${paths.join(', ') || 'nothing'}, none of which is in the sidebar`).toBe(true)
    }
  })
})
