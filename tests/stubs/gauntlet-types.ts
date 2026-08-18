/**
 * Minimal stand-in for `@gauntlet/types`.
 *
 * The real package lives on Appbrew's private registry, so it cannot be
 * installed in CI. Only the handful of `AnalyticsEvent` members that
 * `src/events.ts` actually references are needed here — the values are copied
 * verbatim from `@gauntlet/types/src/integrations/analytics.ts`.
 */
export const AnalyticsEvent = {
  ADD_PAYMENT_INFO: 'add_payment_info',
  SELECT_ITEM: 'select_item',
  SELECT_PROMOTION: 'select_promotion',
  VIEW_BLOCK: 'view_block',
  VIEW_PROMOTION: 'view_promotion',
  PURCHASE: 'purchase',
  REFUND: 'refund',
  LOGOUT: 'logout',
  APP_INSTALL_ANDROID: 'app_install_android',
  APP_INSTALL_IOS: 'app_install_ios',
} as const

export type AnalyticsEvent = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent]
export type AnalyticsPayload = any
export type AnalyticsEventParams = string
export type AppConfig = any
