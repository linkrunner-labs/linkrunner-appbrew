import { AppState, Linking } from 'react-native'
import { navigationRef, useAppStore } from '@gauntlet/state'
import linkrunner from 'rn-linkrunner'

import { trackerStorage } from './storage'
import { withTimeout } from './utils'

/**
 * Appbrew's router is reached through exactly one hook:
 * `useAppStore.getState().route.setInitialUrl(url)`, watched by `useDeepLink`.
 * `@gauntlet/branch` carries a comment warning that without this bridge, links
 * open the app but never redirect.
 *
 * Two things about that setter make this harder than it looks
 * (`@gauntlet/state/src/lib/route.ts:447`):
 *
 *   setInitialUrl: (url) => {
 *     if (!url) return
 *     const prefixes = get().config.data?.store?.deepLinkPrefix
 *     const initialUrl = get().route.initialUrl
 *     if (initialUrl && !prefixes?.some((s) => initialUrl.startsWith(s))) return
 *     set((s) => { s.route.initialUrl = url })
 *   }
 *
 * 1. The guard drops our write when a url is already present *and does not*
 *    match a prefix. So an existing valid deep link gets silently overwritten,
 *    while an existing invalid one blocks us. That is backwards from what you
 *    would want, and it is the actual trap.
 * 2. `getInitialURL` in `hooks/deeplink.ts:138` tries to clear the slot with
 *    `setInitialUrl(null)` — which hits the `if (!url) return` guard on line
 *    one and never clears anything. The intent was `resetInitialUrl()`. So
 *    after react-navigation consumes a cold-start url, the stale value stays
 *    in the slot and blocks every later plain write.
 *
 * The sanctioned way through is the one Appbrew uses on itself in
 * `@gauntlet/brewery/src/app-init.tsx:80-82` — `resetInitialUrl()` then
 * `setInitialUrl(url)`. That bypasses the guard, but it is an unconditional
 * clobber, so we may only use it once we know nobody else owns a real link.
 */
function writeToRouter(url: string) {
  const route = useAppStore.getState().route
  route.resetInitialUrl()
  route.setInitialUrl(url)
}

/**
 * `subscribe()` in `hooks/deeplink.ts` only forwards to react-navigation once
 * nav is ready. Writing earlier leaves the value sitting in the slot to be
 * picked up later by the never-clearing `getInitialURL` — which happens to work
 * but only by accident.
 */
async function waitForNavReady(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (navigationRef.isReady()) return true
    } catch {
      /* navigationRef may not be attached yet */
    }
    // RN throttles timers in the background; don't spin for 10s off-screen.
    if (AppState.currentState !== 'active') return false
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

export interface DeeplinkBridgeOptions {
  /** Route resolved deferred links into the Appbrew router. Attribution still runs when false. */
  routing: boolean
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>
  debug?: boolean
}

/**
 * Wires deep links into Linkrunner, and — for the deferred case only — into
 * Appbrew's router.
 *
 * Deliberately asymmetric. A user-initiated link is authoritative and Appbrew
 * is already routing it, so we only report it for attribution. A deferred link
 * is speculative, so it may only fill an empty slot. Losing a deferred
 * destination is far cheaper than hijacking an intentional tap.
 *
 * Never awaited by `initTracker`: this waits on native deferred-attribution
 * resolution (install referrer, server lookup) which can take seconds, and
 * blocking on it would hold up the entire queued-event backlog.
 */
export async function bootstrapDeepLinks(options: DeeplinkBridgeOptions) {
  const { routing, run, debug } = options

  // Warm starts. Attribution only — Appbrew's own `subscribe()` handles the
  // navigation, and writing these back would double-navigate.
  const subscription = Linking.addEventListener('url', ({ url }) => {
    if (!url) return
    run('handleDeeplink:warm', () => linkrunner.handleDeeplink(url))
  })

  // Cold start. Idempotent and side-effect free, and the definitive signal for
  // "this launch came from a real link".
  const incoming = await Linking.getInitialURL().catch(() => null)
  if (incoming) {
    trackerStorage.markDeferredConsumed()
    await run('handleDeeplink:cold', () => linkrunner.handleDeeplink(incoming))
    return subscription
  }

  if (!routing) return subscription
  if (trackerStorage.isDeferredConsumed()) return subscription

  // `route.initialUrl === null` is ambiguous — untouched, or consumed and reset
  // by `subscribe()`. So watch for writers rather than inferring from the slot.
  // Covers `AppLink.fetchDeferredAppLink()` and `Linking.getInitialURL()` in
  // `useDeepLink`; `resolveLinkFetch()` is a hardcoded `return null` today, but
  // this does not depend on that staying true.
  let foreignWriter = useAppStore.getState().route.initialUrl != null
  const unsubscribe = useAppStore.subscribe(
    (state: any) => state.route.initialUrl,
    (url: string | null) => {
      if (url) foreignWriter = true
    }
  )

  try {
    const attribution: any = await withTimeout(
      Promise.resolve(linkrunner.getAttributionData()),
      15000,
      'getAttributionData'
    )
    const url: string | undefined = attribution?.deeplink

    // Spent either way: once we have seen the first-open attribution response,
    // replaying it on later cold starts would hijack every launch.
    trackerStorage.markDeferredConsumed()

    if (!url) return subscription
    if (foreignWriter) return subscription
    if (!(await waitForNavReady(10000))) return subscription
    // Re-check: a real link may have landed while we waited.
    if (foreignWriter) return subscription

    writeToRouter(url)
    if (debug) {
      console.log('[linkrunner/appbrew] routed deferred deeplink', url)
    }
  } catch (error) {
    console.warn('[linkrunner/appbrew] deferred deeplink failed', error)
  } finally {
    unsubscribe()
  }

  return subscription
}
