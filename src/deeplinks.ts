import { AppState, Linking } from 'react-native'
import { navigationRef, useAppStore } from '@gauntlet/state'
import linkrunner from 'rn-linkrunner'

import { trackerStorage } from './storage'
import { withTimeout } from './utils'

/**
 * Appbrew's router is reached through one hook: `route.setInitialUrl(url)`,
 * watched by `useDeepLink`.
 *
 * Two traps (`@gauntlet/state/src/lib/route.ts:447`):
 *
 * 1. The setter drops the write when a url is already present *and does not*
 *    match a `deepLinkPrefix`. So a valid deep link gets silently overwritten
 *    while an invalid one blocks us — backwards from what you would want.
 * 2. `getInitialURL` (`hooks/deeplink.ts:138`) tries to clear the slot with
 *    `setInitialUrl(null)`, which hits that setter's own null guard and clears
 *    nothing. So a stale url blocks every later plain write.
 *
 * Hence the `resetInitialUrl()` + `setInitialUrl()` pattern Appbrew uses on
 * itself (`app-init.tsx:80-82`). It bypasses the guard but clobbers
 * unconditionally, so only use it once nobody else owns a real link.
 */
function writeToRouter(url: string) {
  const route = useAppStore.getState().route
  route.resetInitialUrl()
  route.setInitialUrl(url)
}

/**
 * `subscribe()` only forwards to react-navigation once nav is ready. Writing
 * earlier leaves the value to be picked up by the never-clearing
 * `getInitialURL`, which works only by accident.
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
 * Deliberately asymmetric: a user-initiated link is authoritative and Appbrew
 * already routes it, so we only report it for attribution. A deferred link is
 * speculative and may only fill an empty slot — losing one is far cheaper than
 * hijacking an intentional tap.
 */
export async function bootstrapDeepLinks(options: DeeplinkBridgeOptions) {
  const { routing, run, debug } = options

  // Warm starts: attribution only. Appbrew's `subscribe()` handles navigation;
  // writing these back would double-navigate.
  const subscription = Linking.addEventListener('url', ({ url }) => {
    if (!url) return
    run('handleDeeplink:warm', () => linkrunner.handleDeeplink(url))
  })

  // Definitive signal for "this launch came from a real link".
  const incoming = await Linking.getInitialURL().catch(() => null)
  if (incoming) {
    trackerStorage.markDeferredConsumed()
    await run('handleDeeplink:cold', () => linkrunner.handleDeeplink(incoming))
    return subscription
  }

  if (!routing) return subscription
  if (trackerStorage.isDeferredConsumed()) return subscription

  // `initialUrl === null` is ambiguous (untouched, or consumed and reset by
  // `subscribe()`), so watch for writers rather than inferring from the slot.
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

    // Spent either way — replaying it on later cold starts would hijack them.
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
