import type {
  AttributionData,
  DeeplinkData,
  IntegrationData,
  LinkrunnerConsent,
  UserData,
} from 'rn-linkrunner'

import type { LinkrunnerTrackerV2 } from './analyticsV2'
import { applyConsent } from './consent'

/**
 * Module-level entry points.
 *
 * Merchants construct the tracker once in `App.tsx` and hand it to Appbrew's
 * `AnalyticsProvider`; screens never hold that instance. These functions
 * delegate to the most recently constructed tracker so a screen can read
 * attribution or push user data without threading the instance through.
 */

let activeTracker: LinkrunnerTrackerV2 | undefined

/** Called by the tracker constructor. The last constructed tracker wins. */
export function registerActiveTracker(tracker: LinkrunnerTrackerV2) {
  activeTracker = tracker
}

export function getActiveTracker(): LinkrunnerTrackerV2 | undefined {
  return activeTracker
}

function requireTracker(label: string): LinkrunnerTrackerV2 | undefined {
  if (!activeTracker) {
    console.warn(
      `[linkrunner/appbrew] ${label} called before LinkrunnerTrackerV2 was constructed`
    )
  }
  return activeTracker
}

/**
 * Attribution for this install: the deferred deep link and the campaign that
 * drove the install. Resolves once the tracker has initialised; `undefined`
 * when no token is configured or the SDK has no data.
 */
export function getAttributionData(): Promise<AttributionData | undefined> {
  const tracker = requireTracker('getAttributionData')
  return tracker ? tracker.getAttributionData() : Promise.resolve(undefined)
}

/**
 * Google Ads consent. SDK-level state, so this works before the tracker exists
 * and before `init()`, which is when the SDK wants it. Call again whenever the
 * user's consent changes.
 */
export function setConsent(consent: LinkrunnerConsent): void {
  const tracker = activeTracker
  if (tracker) tracker.setConsent(consent)
  else applyConsent(consent)
}

/**
 * Push extra user fields (analytics ids, phone, name) to the current user.
 * `id` defaults to the resolved customer id, or the device id for guests.
 */
export function setUserData(data: Partial<UserData>): Promise<void> {
  const tracker = requireTracker('setUserData')
  return tracker ? tracker.setUserData(data) : Promise.resolve()
}

/** Third-party integration ids, such as the CleverTap ID. */
export function setAdditionalData(data: IntegrationData): Promise<void> {
  const tracker = requireTracker('setAdditionalData')
  return tracker ? tracker.setAdditionalData(data) : Promise.resolve()
}

/**
 * Report a deep link to Linkrunner and learn whether it was a Linkrunner link.
 * The tracker already does this for every incoming link; call it only for urls
 * that reach the app through another channel.
 */
export function handleDeeplink(url: string): Promise<DeeplinkData | undefined> {
  const tracker = requireTracker('handleDeeplink')
  return tracker ? tracker.handleDeeplink(url) : Promise.resolve(undefined)
}
