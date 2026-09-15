import { AnalyticsTrackerV2 } from '@gauntlet/analytics'
import { useAppStore } from '@gauntlet/state'
import {
  AnalyticsEvent,
  AnalyticsEventParams,
  type AnalyticsPayload,
  type AppConfig,
} from '@gauntlet/types'
import linkrunner, {
  type AttributionData,
  type DeeplinkData,
  type IntegrationData,
  type LinkrunnerConsent,
  type UserData,
} from 'rn-linkrunner'

import { registerActiveTracker } from './api'
import {
  applyConsent,
  applyTcfConsentCollection,
  consentFromSettings,
} from './consent'
import { bootstrapDeepLinks } from './deeplinks'
import { readClevertapId, readFirebaseAnalyticsIds } from './integrations'
import { registerPushToken } from './push'
import {
  DEFAULT_EVENTS_MAPPER,
  buildEventData,
  buildPurchaseEventData,
} from './events'
import { trackerStorage } from './storage'
import type {
  LinkrunnerIntegrationConfig,
  LinkrunnerTrackerOptions,
} from './types'
import {
  Serializer,
  finiteNumber,
  nonEmptyString,
  normalizeCustomerId,
  withTimeout,
} from './utils'

const DEFAULT_EVENTS_WHITELIST = Object.values(AnalyticsEvent)
const DEFAULT_PARAMS_WHITELIST = Object.values(AnalyticsEventParams)

/**
 * Payment `type` is part of Linkrunner's dedup key `(type, payment_id)`.
 *
 * It must therefore be a constant. Deriving it from something like
 * `analytics.isRepeatCustomer()` — a network call whose answer can differ
 * between launches — would change the key on a retry and let a duplicate
 * payment through.
 */
const PAYMENT_TYPE = 'DEFAULT' as const
const PAYMENT_STATUS = 'PAYMENT_COMPLETED' as const

/** Deferred attribution can wait on install referrer plus a server lookup. */
const ATTRIBUTION_TIMEOUT_MS = 15000
/**
 * How long a public call waits for Appbrew to invoke `initTracker`. It runs
 * seconds into the session (after splash, push prompt and ATT), so a screen
 * that mounts early must wait rather than fail.
 */
const INIT_WAIT_TIMEOUT_MS = 30000

/**
 * Linkrunner attribution for Appbrew apps.
 *
 * Register alongside Appbrew's own trackers:
 *
 *   AnalyticsProvider.getInstance().addTracker(new LinkrunnerTrackerV2())
 *
 * Configuration comes from `config.integrations.linkrunner`, populated in the
 * Appbrew dashboard from the `appbrew.settings` manifest in package.json.
 * Constructor options override it, which is how local development works — the
 * demo store config has no `integrations.linkrunner` key at all.
 */
export class LinkrunnerTrackerV2 extends AnalyticsTrackerV2 {
  private overrides: LinkrunnerTrackerOptions
  private settings: LinkrunnerIntegrationConfig = {}
  private enabled = false
  private serializer = new Serializer()
  private initPromise?: Promise<void>
  /** Settles when Appbrew calls `initTracker`; public methods wait on it. */
  private initStarted: Promise<void>
  private markInitStarted!: () => void
  private attributionPromise?: Promise<AttributionData | undefined>
  /** Set by Appbrew's `signup` event, so `signup()` can carry `is_first_time_user`. */
  private firstTimeUser = false

  private instanceId = ''
  private customerId?: string
  private lastUserSnapshot?: string

  constructor(options: LinkrunnerTrackerOptions = {}) {
    super()
    this.overrides = options
    this.initStarted = new Promise<void>((resolve) => {
      this.markInitStarted = resolve
    })
    registerActiveTracker(this)

    // Must be set here, NOT in initTracker: AnalyticsProviderV2 checks
    // eventsWhitelist *before* calling send(), so events arriving while it is
    // still the base class's empty array are dropped, not queued. initEvents()
    // fires app_install_* in exactly that window. Appbrew's own
    // FacebookTrackerV2 sets its whitelist in initTracker and loses them.
    this.eventsWhitelist = DEFAULT_EVENTS_WHITELIST
    this.paramsWhitelist = DEFAULT_PARAMS_WHITELIST
    this.eventsMapper = { ...DEFAULT_EVENTS_MAPPER }
    this.paramsMapper = {}
  }

  // ---------------------------------------------------------------- lifecycle

  /**
   * Called on every app open, from `@gauntlet/brewery/src/shell.tsx:238`, after:
   * splash hides -> navigation ready -> `await getUserConsent()`.
   *
   * `getUserConsent()` is the iOS ATT prompt, so IDFA is already resolved by the
   * time we run — hence no ATT handling in this package.
   */
  async initTracker(config?: AppConfig): Promise<void> {
    // The base class calls this with no `.catch`; a rejection would leave
    // `initialized === false` forever and queue every later event into an array
    // that is never drained. Must never reject, must run once.
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      try {
        await this.doInit(config)
      } catch (error) {
        console.warn('[linkrunner/appbrew] initTracker failed', error)
      }
    })()
    this.markInitStarted()

    return this.initPromise
  }

  private async doInit(config?: AppConfig) {
    const remote =
      ((config as any)?.integrations?.linkrunner as
        | LinkrunnerIntegrationConfig
        | undefined) || {}

    // Constructor options win, so a dev build can run without remote config.
    const settings: LinkrunnerIntegrationConfig = {
      ...remote,
      ...this.overrides,
    }
    this.settings = settings

    const token = nonEmptyString(settings.token)
    if (!token) {
      // `enabled` makes every later SDK call a cheap no-op, rather than each
      // one early-returning with its own console.error.
      console.warn(
        '[linkrunner/appbrew] no token in config.integrations.linkrunner — tracker disabled'
      )
      return
    }

    if (settings.eventsMapper) {
      this.eventsMapper = { ...DEFAULT_EVENTS_MAPPER, ...settings.eventsMapper }
    }
    if (settings.paramsMapper) this.paramsMapper = { ...settings.paramsMapper }
    if (settings.eventsWhitelist?.length) {
      this.eventsWhitelist = settings.eventsWhitelist
    }
    if (settings.paramsWhitelist?.length) {
      this.paramsWhitelist = settings.paramsWhitelist
    }

    const analytics = useAppStore.getState().analytics
    // Synchronous and MMKV-persisted, so stable for the life of the install.
    this.instanceId = analytics.getInstanceId()
    this.customerId =
      this.readCustomerIdFromStore() ?? trackerStorage.getCustomerId()

    // Consent must reach the SDK before `init()`: the install payload is built
    // during init, and consent set afterwards only applies to the next launch.
    const consent = consentFromSettings(settings)
    if (consent) applyConsent(consent, settings.debug)
    if (settings.enableTCFConsentCollection) {
      applyTcfConsentCollection(true, settings.debug)
    }

    // Awaited: every other SDK method silently no-ops until the token is set,
    // with no queue to recover from.
    await withTimeout(
      Promise.resolve(
        linkrunner.init(
          token,
          settings.secretKey,
          settings.keyId,
          settings.disableIdfa,
          !!settings.debug
        )
      ),
      10000,
      'init'
    )
    this.enabled = true

    if (settings.enablePIIHashing) {
      try {
        linkrunner.enablePIIHashing(true)
      } catch (error) {
        console.warn('[linkrunner/appbrew] enablePIIHashing failed', error)
      }
    }

    // Awaited: `initialized = true` releases the queued backlog, and a queued
    // purchase must not reach capturePayment before the SDK knows any user.
    await withTimeout(
      Promise.resolve(
        linkrunner.setCustomerUserId(this.customerId ?? this.instanceId)
      ),
      8000,
      'setCustomerUserId'
    )

    // Not awaited: waits on native attribution resolution, which can take
    // seconds. No event depends on the result.
    bootstrapDeepLinks({
      routing: this.settings.deeplinkRouting !== false,
      run: (label, fn) => this.run(label, fn),
      getAttribution: () => this.fetchAttribution(),
      debug: this.settings.debug,
    }).catch((error) => {
      console.warn('[linkrunner/appbrew] deeplink bridge failed', error)
    })

    // Not awaited: getAPNSToken() can block on APNs registration.
    if (settings.uninstallTracking !== false) {
      registerPushToken({
        run: (label, fn) => this.run(label, fn),
        debug: settings.debug,
      }).catch((error) => {
        console.warn('[linkrunner/appbrew] push token registration failed', error)
      })
    }

    // Not awaited: the CleverTap bridge answers over a callback that can lag
    // behind its own native init. Nothing in the event path depends on it.
    if (settings.clevertapIntegration !== false) {
      this.linkClevertapId()
    }

    this.resolveIdentity()
  }

  private linkClevertapId() {
    readClevertapId()
      .then((clevertapId) => {
        if (!clevertapId) return
        return this.run('setAdditionalData:clevertap', () =>
          linkrunner.setAdditionalData({ clevertapId })
        )
      })
      .catch((error) => {
        console.warn('[linkrunner/appbrew] CleverTap id lookup failed', error)
      })
  }

  /**
   * Resolves once Appbrew has called `initTracker` and init has settled.
   * Returns whether the tracker ended up enabled.
   */
  private async whenReady(): Promise<boolean> {
    try {
      await withTimeout(this.initStarted, INIT_WAIT_TIMEOUT_MS, 'initTracker')
      await this.initPromise
    } catch (error) {
      console.warn('[linkrunner/appbrew] tracker not initialised', error)
      return false
    }
    return this.enabled
  }

  /**
   * One native `getAttributionData()` per launch, shared between deferred deep
   * link routing and the public accessor. A failed call is not cached, so the
   * next caller retries.
   */
  private fetchAttribution(): Promise<AttributionData | undefined> {
    if (!this.attributionPromise) {
      this.attributionPromise = withTimeout(
        Promise.resolve(linkrunner.getAttributionData()),
        ATTRIBUTION_TIMEOUT_MS,
        'getAttributionData'
      )
        .then((data) => (data ? (data as AttributionData) : undefined))
        .catch((error) => {
          console.warn('[linkrunner/appbrew] getAttributionData failed', error)
          this.attributionPromise = undefined
          return undefined
        })
    }
    return this.attributionPromise
  }

  // --------------------------------------------------------------- public API

  /**
   * Attribution for this install: `deeplink` and `campaignData`. Waits for
   * init; `undefined` when the tracker is disabled or the SDK has no data.
   */
  async getAttributionData(): Promise<AttributionData | undefined> {
    if (!(await this.whenReady())) return undefined
    return this.fetchAttribution()
  }

  /**
   * Google Ads consent. Works before init (the SDK stores it), and should be
   * called again whenever the user's choice changes.
   */
  setConsent(consent: LinkrunnerConsent): void {
    applyConsent(consent, this.settings.debug)
  }

  /**
   * Push additional user fields. `id` defaults to the resolved customer id, or
   * the device id for guests, so callers can pass just the fields they have.
   */
  async setUserData(data: Partial<UserData>): Promise<void> {
    if (!(await this.whenReady())) return
    const id = nonEmptyString(data.id) ?? this.resolveUserId()
    await this.run('setUserData', () =>
      linkrunner.setUserData({ ...data, id })
    )
  }

  /** Third-party integration ids, such as the CleverTap ID. */
  async setAdditionalData(data: IntegrationData): Promise<void> {
    if (!(await this.whenReady())) return
    await this.run('setAdditionalData', () => linkrunner.setAdditionalData(data))
  }

  /**
   * Report a url to Linkrunner and learn whether it was a Linkrunner link.
   * Incoming links are already reported by the tracker; this is for urls that
   * arrive through another channel (push payloads, in-app banners).
   */
  async handleDeeplink(url: string): Promise<DeeplinkData | undefined> {
    const target = nonEmptyString(url)
    if (!target) return undefined
    if (!(await this.whenReady())) return undefined
    try {
      const result = await withTimeout(
        Promise.resolve(linkrunner.handleDeeplink(target)),
        8000,
        'handleDeeplink'
      )
      return result ? (result as DeeplinkData) : undefined
    } catch (error) {
      console.warn('[linkrunner/appbrew] handleDeeplink failed', error)
      return undefined
    }
  }

  /**
   * Resolves the logged-in user from the store and runs the identity lifecycle.
   *
   * Called from three places: once during `initTracker`, and again on the
   * `signup` / `login` events. `setUserDetails` may never fire on a launch where
   * the user is already
   *
   * logged in: the subscription in `AnalyticsProviderV2.initEvents()` has no
   * `fireImmediately`, and `trackersInit()` runs seconds into the session —
   * after splash, the push dialog and ATT. `user.data.userDetails` usually
   * reaches `'idle'` well before that, and the selector then never changes
   * again, so the callback is never invoked for the whole launch.
   *
   * Safe to call repeatedly: `setUserDetails` short-circuits on an unchanged
   * user, and `signup()` runs at most once per (install, user).
   */
  private resolveIdentity() {
    const user = this.readUserDetailsFromStore()
    if (user?.id) void this.setUserDetails(user)
  }

  /**
   * Drain the user queue first, then delegate.
   *
   * The base class drains `eventQueue` first and `setUserEventQueue` last, so a
   * queued purchase would reach `capturePayment` before the queued
   * `setUserDetails` had run `signup()`.
   *
   * Delegating to `super` rather than reimplementing keeps this
   * forward-compatible: if Appbrew adds a fourth queue, it still gets drained.
   */
  processBacklogEventsFromQueue(): void {
    while (this.setUserEventQueue.length > 0) {
      const { user } = this.setUserEventQueue.shift() || {}
      void this.setUserDetails(user)
    }
    super.processBacklogEventsFromQueue()
  }

  // ----------------------------------------------------------------- identity

  private readUserDetailsFromStore(): any | undefined {
    const details = (useAppStore.getState() as any)?.user?.data?.userDetails
    return details?.status === 'idle' ? details?.data : undefined
  }

  private readCustomerIdFromStore() {
    return normalizeCustomerId(this.readUserDetailsFromStore()?.id)
  }

  /**
   * Read synchronously from the store at call time. The `setUserDetails` channel
   * is debounced and may not fire at all, so depending on it here would be
   * fragile — the store already holds the id.
   *
   * Deliberately not `await analytics.getCustomerId()`: its fallback makes a
   * network round trip inside the event path and still returns null for guests.
   */
  private resolveUserId(): string {
    return (
      this.readCustomerIdFromStore() ??
      this.customerId ??
      trackerStorage.getCustomerId() ??
      this.instanceId
    )
  }

  private async toUserData(user: any, id: string): Promise<UserData> {
    const data: UserData = { id }

    const name = nonEmptyString(user?.displayName)
    if (name) data.name = name

    const email = nonEmptyString(user?.email)
    if (email) data.email = email

    const phone = nonEmptyString(user?.phone)
    if (phone) data.phone = phone

    // Helps Linkrunner tell a reinstall apart from a genuinely new user.
    const createdAt = nonEmptyString(user?.createdAt)
    if (createdAt) data.user_created_at = createdAt
    // Only asserted, never denied: absence means "not known", not "returning".
    if (this.firstTimeUser) data.is_first_time_user = true

    // GA4 ids let the merchant join Linkrunner attribution to their Firebase
    // or BigQuery export.
    if (this.settings.analyticsIdentifiers !== false) {
      Object.assign(data, await readFirebaseAnalyticsIds())
    }

    return data
  }

  async setUserDetails(user?: any): Promise<void> {
    const id = normalizeCustomerId(user?.id)
    if (!id) return

    const userData = await this.toUserData(user, id)

    // The subscription refires on any userDetails mutation (address edits,
    // profile updates), so skip identical repeats.
    const snapshot = JSON.stringify(userData)
    if (snapshot === this.lastUserSnapshot) return
    this.lastUserSnapshot = snapshot
    this.customerId = id

    await this.run('identity', async () => {
      await linkrunner.setCustomerUserId(id)

      // Once per (install, user) rather than once per launch.
      if (trackerStorage.getSignedUpUserId() !== id) {
        await linkrunner.signup({ user_data: userData })
        trackerStorage.setSignedUpUserId(id)
      } else {
        await linkrunner.setUserData(userData)
      }

      trackerStorage.setCustomerId(id)
    })
  }

  // ------------------------------------------------------------------- events

  async sendEvent(event?: AnalyticsEvent, payload?: AnalyticsPayload) {
    if (!event || !this.enabled) return
    const data: AnalyticsPayload = payload || {}

    switch (event) {
      case AnalyticsEvent.LOGOUT:
        return this.handleLogout()

      case AnalyticsEvent.PURCHASE:
        return this.handlePurchase(data)

      case AnalyticsEvent.REFUND:
        return this.handleRefund(data)

      // `init()` already records the install.
      case AnalyticsEvent.APP_INSTALL_ANDROID:
      case AnalyticsEvent.APP_INSTALL_IOS:
        return

      // Both drive signup(). Neither event carries a user object — Appbrew
      // delivers that via setUserDetails — so identity is read from the store.
      // A second trigger alongside that channel, which has no fireImmediately
      // and can be missed. Idempotent per (install, user), so no duplicate
      // signup. Both still forward as ordinary events.
      case AnalyticsEvent.SIGNUP:
        this.firstTimeUser = true
        this.resolveIdentity()
        break
      case AnalyticsEvent.LOGIN:
        this.firstTimeUser = false
        this.resolveIdentity()
        break

      default:
        break
    }

    const name = nonEmptyString(event)
    if (!name) return

    const eventData = buildEventData(data, await this.eventSourceParams())
    await this.run(`trackEvent:${name}`, () =>
      linkrunner.trackEvent(name, eventData)
    )
  }

  async sendScreenView(screenName?: string) {
    if (!this.enabled || !screenName) return
    // Off unless explicitly enabled — by far the highest-volume event.
    if (!this.settings.trackScreenViews) return

    await this.run('trackEvent:screen_view', () =>
      linkrunner.trackEvent(AnalyticsEvent.SCREEN_VIEW, {
        [AnalyticsEventParams.SCREEN_NAME]: screenName,
      })
    )
  }

  // ------------------------------------------------------------------ revenue

  private async handlePurchase(payload: AnalyticsPayload) {
    // Appbrew's provider dedups purchases in an in-memory Set that does not
    // survive a process restart, so a kill/relaunch on the thank-you screen
    // re-emits the event. Linkrunner's (type, payment_id) dedup is the only real
    // protection — pass transaction_id verbatim; a uuid would defeat it.
    const paymentId = nonEmptyString(payload?.transaction_id)
    if (!paymentId) {
      console.warn(
        '[linkrunner/appbrew] purchase without transaction_id — skipping capturePayment'
      )
      return
    }

    const amount = finiteNumber(payload?.value, 0)
    const currency = nonEmptyString(payload?.currency)
    const userId = this.resolveUserId()
    const eventData = buildPurchaseEventData(
      payload,
      await this.eventSourceParams()
    )

    await this.run('capturePayment', () =>
      linkrunner.capturePayment({
        paymentId,
        userId,
        amount,
        type: PAYMENT_TYPE,
        status: PAYMENT_STATUS,
        // `currency` is also passed top-level: rn-linkrunner's bridge drops it
        // today (ios/LinkrunnerSDK.swift, android ModelConverter.kt both
        // enumerate fields without it), but the native SDKs accept it and the
        // bridge fix is in flight. It stays in eventData regardless, so the
        // value is never lost in the meantime.
        ...(currency ? { currency } : {}),
        eventData,
      } as any)
    )
  }

  /**
   * Off by default, and hard-gated on a payment id.
   *
   * `removePayment({ userId })` with no `paymentId` deletes *every* payment for
   * that user. And the two ids are not the same namespace: purchases carry
   * `transaction_id = cart.order.name || numericOrderId || cartId` from
   * `getPurchaseInfo()`, while refunds carry `transaction_id = orderData.id`
   * from `getOrderInfo()`. So this usually no-ops rather than matching.
   *
   * Left off until that mapping is verified against a real store — the failure
   * mode for getting it wrong is wiping a customer's payment history.
   */
  private async handleRefund(payload: AnalyticsPayload) {
    if (!this.settings.enableRefunds) return

    const paymentId = nonEmptyString(payload?.transaction_id)
    if (!paymentId) return

    await this.run('removePayment', () =>
      linkrunner.removePayment({ userId: this.resolveUserId(), paymentId })
    )
  }

  private async handleLogout() {
    // `setUserDetails` only fires on `status === 'idle' && data`, so logout
    // never reaches it. Without this a guest purchase after logout is attributed
    // to the previous customer — permanently, since capturePayment is deduped.
    this.customerId = undefined
    this.lastUserSnapshot = undefined
    this.firstTimeUser = false
    trackerStorage.clearCustomerId()

    // `lr:signed-up-user-id` is deliberately kept, so a re-login is a
    // setUserData rather than a second signup.
    await this.run('logout', () =>
      linkrunner.setCustomerUserId(this.instanceId)
    )
  }

  // ------------------------------------------------------------------ helpers

  /** Session UTMs, as `@gauntlet/branch` attaches to every event. */
  private async eventSourceParams(): Promise<Record<string, any>> {
    try {
      const params = await useAppStore
        .getState()
        .analytics.getEventSourceUtmParams()
      return params || {}
    } catch {
      return {}
    }
  }

  private run(label: string, fn: () => Promise<unknown>) {
    if (!this.enabled) return Promise.resolve()
    return this.serializer.run(label, fn)
  }
}

/** Alias matching Appbrew's naming for tracker exports. */
export const LinkrunnerTracker = LinkrunnerTrackerV2
