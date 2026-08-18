import { Platform } from 'react-native'
import linkrunner from 'rn-linkrunner'

/**
 * Uninstall tracking: Linkrunner sends a silent push and observes the failure,
 * so it needs the device token — APNs on iOS, FCM on Android.
 *
 * `@react-native-firebase/messaging` is an optional peer, required lazily so an
 * app without push degrades quietly instead of crashing.
 *
 * Also needs Settings > Uninstall Tracking configured in the dashboard, or the
 * token is accepted but no uninstall is ever reported.
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

/** Returns the token-refresh unsubscribe, or undefined when messaging is absent. */
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
    // iOS needs the APNs token; getToken() returns an FCM token there, which
    // cannot reach APNs.
    const token =
      Platform.OS === 'ios'
        ? await messaging().getAPNSToken()
        : await messaging().getToken()
    send(token)
  } catch (error) {
    console.warn('[linkrunner/appbrew] could not read push token', error)
  }

  try {
    // Android rotates FCM tokens; a stale one silently breaks uninstall
    // attribution.
    return messaging().onTokenRefresh((token: string) => send(token))
  } catch {
    return undefined
  }
}
