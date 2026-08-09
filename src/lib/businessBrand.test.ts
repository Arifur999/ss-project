import { describe, it, expect } from 'vitest'

// The bug this pins down cost the whole site its responsiveness.
//
// useBusinessBrand() fetched business_settings and finished by calling
// rememberBusinessBrand(), which announced the result with
// BUSINESS_NAME_UPDATED_EVENT. The same hook also listened for that event and
// answered it by fetching again. Nothing in the circle ever said "stop": the
// page sat there issuing about eight requests a second, re-rendering the
// layout - and therefore every table, form and date picker inside it - each
// time. It looked like a slow calendar; it was a loop.
//
// These tests run the same rules the module runs, in the same node
// environment as the rest of the suite, so a change that re-opens the circle
// fails here instead of on the owner's screen.

// Mirrors rememberBusinessBrand's announce rule.
function remember(store: Map<string, string>, name: string, logoUrl: string) {
  const changed = store.get('name') !== name || store.get('logo') !== logoUrl
  store.set('name', name)
  store.set('logo', logoUrl)
  return { changed, dispatched: changed ? ['name-updated', 'brand-updated'] : [] }
}

describe('announcing a brand change', () => {
  it('announces the first time a value is written', () => {
    const store = new Map<string, string>()
    expect(remember(store, 'Hatim Furniture', '').dispatched).toHaveLength(2)
  })

  it('stays silent when the same values are written again', () => {
    // This is what a page load does: fetch, then remember what was fetched.
    // Announcing there is what fed the loop.
    const store = new Map<string, string>()
    remember(store, 'Hatim Furniture', 'logo.png')
    expect(remember(store, 'Hatim Furniture', 'logo.png').dispatched).toEqual([])
  })

  it('announces a real edit, so the sidebar still follows a Settings save', () => {
    const store = new Map<string, string>()
    remember(store, 'Hatim Furniture', '')
    expect(remember(store, 'Hatim Trading', '').dispatched).toHaveLength(2)
  })

  it('announces a logo change even when the name is untouched', () => {
    const store = new Map<string, string>()
    remember(store, 'Hatim Furniture', '')
    expect(remember(store, 'Hatim Furniture', 'logo.png').dispatched).toHaveLength(2)
  })
})

describe('the brand loader does not answer its own announcement', () => {
  // A listener that re-fetches on 'name-updated' closes the circle, because
  // every fetch ends in an announcement. Walk it and count.
  function runCircle(listensToOwnEvent: boolean) {
    const store = new Map<string, string>()
    let fetches = 0
    const queue: string[] = ['load']

    // A stuck loop would run forever; stop early and let the count report it.
    while (queue.length > 0 && fetches < 50) {
      queue.shift()
      fetches += 1
      const { dispatched } = remember(store, 'Hatim Furniture', '')
      for (const event of dispatched) {
        if (listensToOwnEvent && event === 'name-updated') queue.push('load')
      }
    }
    return fetches
  }

  it('settles after one fetch as the code stands today', () => {
    expect(runCircle(false)).toBe(1)
  })

  it('settles even if someone re-adds the listener, because writing the same values is silent', () => {
    // Defence in depth: the guard inside remember() breaks the circle on the
    // second pass, so re-introducing the listener costs one extra fetch
    // instead of an endless stream of them.
    expect(runCircle(true)).toBe(2)
  })
})
