import type { AnalyticsEvent, AnalyticsEventParams } from '@gauntlet/types'

/**
 * Shape of `config.integrations.linkrunner`, populated by the Appbrew dashboard
 * from the `appbrew.settings` manifest in package.json.
 *
 * Behaviour lives here rather than in code because the package declares
 * `requiresNativeBuild: true` — a code change costs a store release across every
 * merchant app, a change here is a dashboard edit.
 */
export interface LinkrunnerIntegrationConfig {
  /** Without it the tracker stays disabled. */
  token?: string
  secretKey?: string
  keyId?: string
  debug?: boolean
  disableIdfa?: boolean
  enablePIIHashing?: boolean

  /** Off by default — by far the highest-volume events. */
  trackScreenViews?: boolean
  /** Defaults to on. */
  deeplinkRouting?: boolean
  /** Defaults to on; no-ops without `@react-native-firebase/messaging`. */
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
 * Constructor overrides, merged *over* the remote config. For local development
 * only — the demo store config has no `integrations.linkrunner` key, so the
 * tracker would otherwise disable itself on boot.
 */
export interface LinkrunnerTrackerOptions
  extends Partial<LinkrunnerIntegrationConfig> {}

/** Meta Catalog Sales payload. See events.ts. */
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
