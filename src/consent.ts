import linkrunner, {
  type ConsentStatus,
  type LinkrunnerConsent,
} from 'rn-linkrunner'

import type { LinkrunnerIntegrationConfig } from './types'

const CONSENT_STATUSES: readonly ConsentStatus[] = ['granted', 'denied', 'unknown']

/**
 * Google Ads consent values arrive from the Appbrew dashboard as free text
 * (the form has no enum control), and from a CMP as booleans. Normalise both
 * to the SDK's tri-state.
 *
 * `undefined` means "not configured", which is distinct from `'unknown'`: an
 * unconfigured flag is left out of the payload entirely, so the backend can
 * tell "never told" apart from "told it is unknown".
 */
export function toConsentStatus(value: unknown): ConsentStatus | undefined {
  if (typeof value === 'boolean') return value ? 'granted' : 'denied'
  if (typeof value !== 'string') return undefined
  const normalised = value.trim().toLowerCase()
  if (normalised === 'true') return 'granted'
  if (normalised === 'false') return 'denied'
  return CONSENT_STATUSES.includes(normalised as ConsentStatus)
    ? (normalised as ConsentStatus)
    : undefined
}

/** Returns `undefined` when no consent setting is configured at all. */
export function consentFromSettings(
  settings: LinkrunnerIntegrationConfig
): LinkrunnerConsent | undefined {
  const consent: LinkrunnerConsent = {}

  const isEEA = toConsentStatus(settings.consentIsEEA)
  if (isEEA) consent.isEEA = isEEA

  const dataUsage = toConsentStatus(settings.consentAdUserData)
  if (dataUsage) consent.hasConsentForDataUsage = dataUsage

  const personalization = toConsentStatus(settings.consentAdPersonalization)
  if (personalization) consent.hasConsentForAdsPersonalization = personalization

  return Object.keys(consent).length > 0 ? consent : undefined
}

/**
 * Forward consent to the SDK. Synchronous and safe before `init()`, which is
 * where the SDK wants it: consent set after `init()` only applies to the next
 * launch's install payload.
 */
export function applyConsent(consent: LinkrunnerConsent, debug?: boolean) {
  try {
    linkrunner.setConsent(consent)
    if (debug) console.log('[linkrunner/appbrew] consent set', consent)
  } catch (error) {
    console.warn('[linkrunner/appbrew] setConsent failed', error)
  }
}

/** Android only inside the SDK; a no-op elsewhere. */
export function applyTcfConsentCollection(enabled: boolean, debug?: boolean) {
  try {
    linkrunner.enableTCFConsentCollection(enabled)
    if (debug) {
      console.log(
        `[linkrunner/appbrew] TCF consent collection ${enabled ? 'enabled' : 'disabled'}`
      )
    }
  } catch (error) {
    console.warn('[linkrunner/appbrew] enableTCFConsentCollection failed', error)
  }
}
