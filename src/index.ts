export { LinkrunnerTracker, LinkrunnerTrackerV2 } from './analyticsV2'
export {
  getActiveTracker,
  getAttributionData,
  handleDeeplink,
  setAdditionalData,
  setConsent,
  setUserData,
} from './api'
export { consentFromSettings, toConsentStatus } from './consent'
export {
  DEFAULT_EVENTS_MAPPER,
  HANDLED_SEPARATELY,
  NEVER_FIRED_EVENTS,
  buildEventData,
  buildPurchaseEventData,
  toEcommercePayload,
} from './events'
export { readClevertapId, readFirebaseAnalyticsIds } from './integrations'
export { TRACKER_STORAGE_KEYS, trackerStorage } from './storage'
export type {
  ConsentSetting,
  EcommercePayload,
  LinkrunnerIntegrationConfig,
  LinkrunnerTrackerOptions,
} from './types'
export type {
  AttributionData,
  CampaignData,
  ConsentStatus,
  DeeplinkData,
  IntegrationData,
  LinkrunnerConsent,
  UserData,
} from 'rn-linkrunner'
