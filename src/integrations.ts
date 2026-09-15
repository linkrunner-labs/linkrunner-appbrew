import { nonEmptyString, tryRequire, withTimeout } from './utils'

/**
 * Third-party identifiers Linkrunner can stitch to a user.
 *
 * Every module here is an optional peer, resolved lazily so an app without it
 * degrades to "field absent" rather than crashing at import time.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadFirebaseAnalytics = () => require('@react-native-firebase/analytics')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const loadClevertap = () => require('clevertap-react-native')

export interface AnalyticsIdentifiers {
  ga_app_instance_id?: string
  ga_session_id?: string
}

/**
 * Firebase Analytics ids, so Linkrunner attribution can be joined against a
 * merchant's GA4 / BigQuery export. `@react-native-firebase/analytics` ships
 * in every Appbrew app, but stays optional here.
 */
export async function readFirebaseAnalyticsIds(
  load: () => any = loadFirebaseAnalytics
): Promise<AnalyticsIdentifiers> {
  const analytics = tryRequire(load)
  if (typeof analytics !== 'function') return {}

  const ids: AnalyticsIdentifiers = {}

  try {
    const appInstanceId = await withTimeout(
      Promise.resolve(analytics().getAppInstanceId()),
      3000,
      'getAppInstanceId'
    )
    const value = nonEmptyString(appInstanceId)
    if (value) ids.ga_app_instance_id = value
  } catch {
    /* best-effort */
  }

  try {
    const sessionId = await withTimeout(
      Promise.resolve(analytics().getSessionId()),
      3000,
      'getSessionId'
    )
    const value = nonEmptyString(sessionId)
    if (value) ids.ga_session_id = value
  } catch {
    /* best-effort */
  }

  return ids
}

/**
 * CleverTap's device id, for the CleverTap analytics integration. The
 * `clevertap-react-native` API is callback-based: `(err, id) => void`.
 */
export function readClevertapId(
  load: () => any = loadClevertap
): Promise<string | undefined> {
  const CleverTap = tryRequire(load)
  if (!CleverTap || typeof CleverTap.getCleverTapID !== 'function') {
    return Promise.resolve(undefined)
  }

  const lookup = new Promise<string | undefined>((resolve) => {
    try {
      CleverTap.getCleverTapID((error: unknown, id: unknown) => {
        resolve(error ? undefined : nonEmptyString(id))
      })
    } catch {
      resolve(undefined)
    }
  })

  return withTimeout(lookup, 5000, 'getCleverTapID').catch(() => undefined)
}
