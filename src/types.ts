import type { AnalyticsEvent, AnalyticsEventParams } from '@gauntlet/types'

/**
 * Shape of `config.integrations.linkrunner`, populated by the Appbrew
 * dashboard from the `appbrew.settings` manifest in package.json.
 *
 * Everything that could plausibly change lives here rather than in code: the
 * package declares `requiresNativeBuild: true`, so a code change costs a native
 * rebuild and a store release across every merchant app, while a change here is
 * a dashboard edit.
 */
export interface LinkrunnerIntegrationConfig {
  /** Linkrunner project token. Without it the tracker stays disabled. */
  token?: string
  /** Optional signing secret, paired with `keyId`. */
  secretKey?: string
  /** Optional key id, paired with `secretKey`. */
  keyId?: string
  /** Verbose SDK logging. */
  debug?: boolean
  /** Opt out of IDFA collection on iOS even when ATT was granted. */
  disableIdfa?: boolean
  /** Hash email/phone on-device before they leave the app. */
  enablePIIHashing?: boolean

  /**
   * Forward `screen_view` / `page_view`. Off by default — these are by far the
   * highest-volume events and are rarely worth attribution spend.
   */
  trackScreenViews?: boolean
  /** Route resolved deferred deep links into the Appbrew router. Defaults to on. */
  deeplinkRouting?: boolean
  /**
   * Register the device push token so Linkrunner can measure uninstalls.
   * Defaults to on; no-ops when `@react-native-firebase/messaging` is absent.
   * Also needs Settings > Uninstall Tracking configured in the dashboard.
   */
  uninstallTracking?: boolean
  /**
   * Forward `refund` to `removePayment`. Off by default: Appbrew's refund
   * payload carries a different id namespace than its purchase payload, so the
   * call would usually no-op. See the README before enabling.
   */
  enableRefunds?: boolean

  eventsMapper?: Record<string, string>
  paramsMapper?: Record<string, string>
  eventsWhitelist?: AnalyticsEvent[]
  paramsWhitelist?: AnalyticsEventParams[]
}

/**
 * Constructor-level overrides, merged *over* the remote config.
 *
 * The Appbrew-hosted config is the source of truth in production. These exist
 * so the tracker can run before/without it — most importantly in local
 * development, where the demo store config has no `integrations.linkrunner`
 * key at all and the tracker would otherwise disable itself on boot.
 */
export interface LinkrunnerTrackerOptions
  extends Partial<LinkrunnerIntegrationConfig> {}

/** Meta Catalog Sales payload shape. See events.ts. */
export interface EcommercePayload {
  content_ids?: string[]
  item_group_ids?: string[]
  contents?: Array<{ id: string; quantity: number; item_price?: number }>
  content_type?: 'product' | 'product_group'
  value?: number
  currency?: string
  num_items?: number
  order_id?: string
}
