import { Platform } from 'react-native'
import linkrunner from 'rn-linkrunner'

/**
 * Uninstall tracking.
 *
 * Linkrunner detects uninstalls by sending a silent push to the device and
 * observing the failure, so it needs the device's push token: the APNs token on
 * iOS, the FCM token on Android.
 *
 * `@react-native-firebase/messaging` is an optional peer. Appbrew apps normally
 * ship it (the sample app has 23.3.1, and `FirebasePush` is a first-class
 * module), but an app without push configured should degrade quietly rather
 * than crash — hence the lazy require instead of a top-level import.
 *
 * Also requires configuration in the Linkrunner dashboard under
 * Settings > Uninstall Tracking: Firebase Project ID for Android, and the APNs
 * p8 key / Key ID / Bundle ID / Team ID for iOS. Without that, the token is
 * accepted but no uninstall is ever reported.
 */
function loadMessaging(): any | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/messaging')
    return mod?.default ?? mod
  } catch {
    return undefined
  }
}

export interface PushTokenOptions {
  run: (label: string, fn: () => Promise<unknown>) => Promise<void>
  debug?: boolean
}

/**
 * Registers the push token and keeps it fresh.
 *
 * Never awaited by `initTracker`: `getAPNSToken()` can block until APNs
 * registration completes, which would hold up the queued-event backlog for
 * something no event depends on.
 *
 * Returns the token-refresh unsubscribe, or undefined when messaging is absent.
 */
export async function registerPushToken(
  options: PushTokenOptions
): Promise<(() => void) | undefined> {
  const { run, debug } = options

  const messaging = loadMessaging()
  if (typeof messaging !== 'function') {
    if (debug) {
      console.log(
        '[linkrunner/appbrew] @react-native-firebase/messaging not installed — uninstall tracking disabled'
      )
    }
    return undefined
  }

  const send = (token?: string | null) => {
    if (!token) return
    run('setPushToken', () => linkrunner.setPushToken(token))
  }

  try {
    // iOS wants the APNs token specifically; getToken() there returns the FCM
    // token, which Linkrunner cannot use to reach APNs.
    const token =
      Platform.OS === 'ios'
        ? await messaging().getAPNSToken()
        : await messaging().getToken()
    send(token)
  } catch (error) {
    console.warn('[linkrunner/appbrew] could not read push token', error)
  }

  try {
    // Android rotates FCM tokens; a stale token silently breaks uninstall
    // attribution, so re-send on every refresh.
    return messaging().onTokenRefresh((token: string) => send(token))
  } catch {
    return undefined
  }
}
