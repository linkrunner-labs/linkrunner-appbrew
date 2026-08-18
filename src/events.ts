import { AnalyticsEvent } from '@gauntlet/types'
import type { AnalyticsPayload } from '@gauntlet/types'

import type { EcommercePayload } from './types'
import { finiteNumber, nonEmptyString } from './utils'

/**
 * Appbrew events that are declared in `AnalyticsEvent` but have zero call sites
 * anywhere in `@gauntlet/*` — they never fire.
 *
 * Kept as documentation, not as a filter. Appbrew's own AppsFlyer and Branch
 * wrappers both map `add_payment_info`, and that mapping has never once fired;
 * listing them here stops us from repeating that and from wondering later why a
 * funnel has a hole.
 */
export const NEVER_FIRED_EVENTS: string[] = [
  AnalyticsEvent.ADD_PAYMENT_INFO,
  AnalyticsEvent.SELECT_ITEM,
  AnalyticsEvent.SELECT_PROMOTION,
  AnalyticsEvent.VIEW_BLOCK,
  AnalyticsEvent.VIEW_PROMOTION,
]

/**
 * Events the tracker handles itself rather than forwarding via `trackEvent`.
 */
export const HANDLED_SEPARATELY: string[] = [
  AnalyticsEvent.PURCHASE,
  AnalyticsEvent.REFUND,
  AnalyticsEvent.LOGOUT,
  // signup/login additionally drive linkrunner.signup(); they are still
  // forwarded as ordinary events.
  AnalyticsEvent.SIGNUP,
  AnalyticsEvent.LOGIN,
  // `init()` records the install; app_install_* fires off a JS-side `has-booted`
  // flag exactly once per install and would only duplicate it.
  AnalyticsEvent.APP_INSTALL_ANDROID,
  AnalyticsEvent.APP_INSTALL_IOS,
]

/**
 * Event names pass through to Linkrunner verbatim.
 *
 * Linkrunner has no enforced event enum, and mapping a custom name onto a
 * standard commerce event (`add_to_cart` -> `AddToCart`) happens in the
 * Linkrunner dashboard regardless of what we send. Renaming here would buy
 * nothing and would put every new Appbrew event behind a package release plus a
 * native rebuild.
 *
 * AppsFlyer and Branch need code-side mappers only because their event names
 * are closed enums (`af_add_to_cart`, `BranchEvent.AddToCart`). Ours are not.
 */
export const DEFAULT_EVENTS_MAPPER: Record<string, string> = {}

interface AppbrewItem {
  item_id?: string | number
  item_variant?: string | number
  item_name?: string
  price?: number | string
  quantity?: number
  [key: string]: any
}

/**
 * Appbrew's `items[]` (built by `transformProduct`) -> Meta Catalog Sales fields.
 *
 * `content_ids` uses the *variant* id because that is what Shopify-fed Meta
 * catalogues key on, while `item_group_ids` carries the product id for the
 * product-group case. Appbrew gives us both, so we can populate both and let
 * the catalogue match on whichever it indexes.
 *
 * `item_price` must match the catalogue price — a mismatch quietly degrades
 * Meta's match rate without failing the call.
 */
export function toEcommercePayload(
  payload: AnalyticsPayload
): EcommercePayload {
  const items: AppbrewItem[] = Array.isArray(payload?.items)
    ? payload.items.filter(Boolean)
    : []

  if (!items.length) {
    const currency = nonEmptyString(payload?.currency)
    return currency ? { currency } : {}
  }

  const contentIds: string[] = []
  const groupIds: string[] = []
  const contents: EcommercePayload['contents'] = []
  let numItems = 0

  for (const item of items) {
    const variantId = nonEmptyString(item.item_variant)
    const productId = nonEmptyString(item.item_id)
    const contentId = variantId ?? productId
    if (!contentId) continue

    const quantity = Math.max(1, Math.round(finiteNumber(item.quantity, 1)))
    numItems += quantity

    contentIds.push(contentId)
    if (productId) groupIds.push(productId)
    contents.push({
      id: contentId,
      quantity,
      item_price: finiteNumber(item.price, 0),
    })
  }

  const out: EcommercePayload = {
    content_type: 'product',
    num_items: numItems,
  }
  if (contentIds.length) out.content_ids = contentIds
  if (groupIds.length) out.item_group_ids = groupIds
  if (contents.length) out.contents = contents

  const value = Number(payload?.value)
  if (Number.isFinite(value)) out.value = value

  const currency = nonEmptyString(payload?.currency)
  if (currency) out.currency = currency

  return out
}

/**
 * Body for a forwarded `trackEvent`.
 *
 * Item-bearing events get the Meta fields merged in alongside the original
 * payload — the raw Appbrew keys stay so nothing is lost for non-Meta uses.
 */
export function buildEventData(
  payload: AnalyticsPayload,
  extra?: Record<string, any>
): Record<string, any> {
  const base: Record<string, any> = { ...(payload || {}) }
  if (Array.isArray(payload?.items) && payload.items.length) {
    Object.assign(base, toEcommercePayload(payload))
  }
  if (extra) Object.assign(base, extra)

  for (const key of Object.keys(base)) {
    if (base[key] === undefined) delete base[key]
  }
  return base
}

/**
 * `event_data` for a purchase. Identical to the event shape plus `order_id`,
 * which Meta requires on `Purchase`.
 */
export function buildPurchaseEventData(
  payload: AnalyticsPayload,
  extra?: Record<string, any>
): Record<string, any> {
  const orderId = nonEmptyString(payload?.transaction_id)
  return buildEventData(payload, { order_id: orderId, ...(extra || {}) })
}
