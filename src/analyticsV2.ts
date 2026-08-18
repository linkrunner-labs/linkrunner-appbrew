import { AnalyticsTrackerV2 } from '@gauntlet/analytics'
import { useAppStore } from '@gauntlet/state'
import {
  AnalyticsEvent,
  AnalyticsEventParams,
  type AnalyticsPayload,
  type AppConfig,
} from '@gauntlet/types'
import linkrunner, { type UserData } from 'rn-linkrunner'

import { bootstrapDeepLinks } from './deeplinks'
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

  private instanceId = ''
  private customerId?: string
  private lastUserSnapshot?: string

  constructor(options: LinkrunnerTrackerOptions = {}) {
    super()
    this.overrides = options

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

    this.resolveIdentity()
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

  private toUserData(user: any, id: string): UserData {
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

    return data
  }

  async setUserDetails(user?: any): Promise<void> {
    const id = normalizeCustomerId(user?.id)
    if (!id) return

    const userData = this.toUserData(user, id)

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
      case AnalyticsEvent.LOGIN:
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
