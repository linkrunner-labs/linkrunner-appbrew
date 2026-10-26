import { AppState } from 'react-native'

import { nonEmptyString, tryRequire } from './utils'

/** notifee `EventType.PRESS`, used when the module does not export the enum. */
const NOTIFEE_PRESS = 1
const TRIGGER_POLL_MS = 250
/** Cold start: Appbrew's `FirebasePush.init` may settle after our init. */
const COLD_TRIGGER_WATCH_MS = 10000
/** Warm start: the tap callback and the `active` transition race. */
const WARM_TRIGGER_WATCH_MS = 3000

/**
 * The modules a push tap can surface through. All optional peers, resolved
 * lazily; tests inject fakes.
 */
export interface PushOpenSources {
  messaging?: () => any
  notifee?: () => any
  firebasePush?: () => any
}

const defaultSources: Required<PushOpenSources> = {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  messaging: () =>
    tryRequire(() => require('@react-native-firebase/messaging')),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  notifee: () => tryRequire(() => require('@notifee/react-native')),
  firebasePush: () =>
    tryRequire(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      () => require('@gauntlet/firebase-push').FirebasePush
    ),
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}

/**
 * The url a push carries, in any shape Appbrew's `FirebasePush` reads:
 * an FCM `RemoteMessage`, a notifee event `detail`, or the `{ type, detail }`
 * event it stores as `notificationTriggerMessage`.
 *
 * `data.link` is either a url or a JSON route (`{ kind, value }`). A route only
 * yields a url when its `value` is one; a screen handle has nothing to attribute.
 */
export function extractPushLink(message: any): string | undefined {
  const source = message?.detail ?? message
  const raw = nonEmptyString(
    source?.notification?.data?.link ?? source?.data?.link
  )
  if (!raw) return undefined
  if (isHttpUrl(raw)) return raw

  try {
    const route = JSON.parse(raw)
    return isHttpUrl(route?.value) ? route.value.trim() : undefined
  } catch {
    return undefined
  }
}

export interface PushOpenOptions {
  /** Reports the url to Linkrunner; expected to dedupe repeats. */
  report: (label: string, url: string) => Promise<void>
  debug?: boolean
  sources?: PushOpenSources
}

/**
 * Report push taps for re-engagement attribution.
 *
 * Appbrew's `FirebasePush` routes a tap from `data.link` itself: a JSON route
 * goes to its navigation handler and a url to `Linking.openURL`, often before
 * our tracker exists. Neither reaches the `Linking` listener in deeplinks.ts,
 * so without this every push open goes unreported.
 *
 * A tap is picked up from four places, since none covers every app state:
 * - `messaging().onNotificationOpenedApp`: background taps on FCM notifications.
 * - `messaging().getInitialNotification()`: cold starts, but on Android it
 *   answers once per message, and `FirebasePush.init` usually asks first.
 * - notifee foreground `PRESS`: notifications `FirebasePush` displays itself
 *   while the app is open.
 * - `FirebasePush.instance.notificationTriggerMessage`: the message it last
 *   opened the app with, which covers the cold start it consumed.
 */
export function bootstrapPushOpens(options: PushOpenOptions): () => void {
  const { report, debug } = options
  const sources = { ...defaultSources, ...options.sources }
  const cleanups: Array<() => void> = []

  const handle = (label: string, message: any) => {
    const url = extractPushLink(message)
    if (!url) return
    if (debug) console.log('[linkrunner/appbrew] push open', label, url)
    void report(`handleDeeplink:push:${label}`, url)
  }

  const messaging = sources.messaging()
  if (typeof messaging === 'function') {
    try {
      const unsubscribe = messaging().onNotificationOpenedApp((message: any) =>
        handle('opened', message)
      )
      if (typeof unsubscribe === 'function') cleanups.push(unsubscribe)
    } catch (error) {
      console.warn('[linkrunner/appbrew] onNotificationOpenedApp failed', error)
    }

    Promise.resolve()
      .then(() => messaging().getInitialNotification())
      .then((message: any) => handle('initial', message))
      .catch(() => undefined)
  }

  const notifee = sources.notifee()
  if (notifee && typeof notifee.onForegroundEvent === 'function') {
    const press = notifee.EventType?.PRESS ?? NOTIFEE_PRESS
    try {
      const unsubscribe = notifee.onForegroundEvent((event: any) => {
        if (event?.type === press) handle('foreground', event.detail)
      })
      if (typeof unsubscribe === 'function') cleanups.push(unsubscribe)
    } catch (error) {
      console.warn('[linkrunner/appbrew] notifee listener failed', error)
    }
  }

  const FirebasePush = sources.firebasePush()
  if (FirebasePush) {
    // Read the static, never `getInstance()`: that would create an instance in
    // an app that does not use FirebasePush.
    let lastTrigger: any = null
    let watchId = 0

    const watchTrigger = async (durationMs: number) => {
      const id = ++watchId
      const deadline = Date.now() + durationMs
      while (id === watchId) {
        const trigger = FirebasePush.instance?.notificationTriggerMessage
        if (trigger && trigger !== lastTrigger) {
          lastTrigger = trigger
          handle('trigger', trigger)
          return
        }
        if (Date.now() >= deadline) return
        await new Promise((resolve) => setTimeout(resolve, TRIGGER_POLL_MS))
      }
    }

    void watchTrigger(COLD_TRIGGER_WATCH_MS)
    try {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void watchTrigger(WARM_TRIGGER_WATCH_MS)
      })
      cleanups.push(() => subscription?.remove?.())
    } catch {
      /* AppState is best-effort here */
    }
  }

  return () => {
    for (const cleanup of cleanups.splice(0)) {
      try {
        cleanup()
      } catch {
        /* already removed */
      }
    }
  }
}
